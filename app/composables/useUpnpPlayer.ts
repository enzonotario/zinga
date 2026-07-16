import type { UpnpPositionInfo, UpnpTransportInfo } from '~/types/playback';
import { invoke } from '@tauri-apps/api/core';
import { computed, onUnmounted, ref } from 'vue';
import { PLAYER_POLLING_INTERVAL, POSITION_UI_TICK_INTERVAL, UPNP_FAST_POLLING_INTERVAL } from '~/constants/polling';
import { timeToSeconds } from '~/utils/time';

const currentUpnpState = ref<string>('STOPPED');
const currentVolume = ref<number>(0);
const positionInfo = ref<UpnpPositionInfo>({
  relTime: '00:00:00',
  trackDuration: '00:00:00',
  track: 0,
  absTime: '00:00:00',
  relCount: 0,
  absCount: 0,
});
const playbackPendingDeviceId = ref<string | null>(null);
const sessionDeviceId = ref<string | null>(null);
const devicePlaybackConfirmed = ref(false);
const frozenPositionSec = ref(0);
const trackBaselineRelSec = ref(0);
const resumeOffsetSec = ref(0);
const needsMopidyCalibration = ref(true);
const lastReportedRelSec = ref(0);
const lastReportedRelAt = ref(0);
const uiTick = ref(0);

let pollingId: ReturnType<typeof setInterval> | null = null;
let uiTickId: ReturnType<typeof setInterval> | null = null;
let pollingDeviceId: string | null = null;
let pollingIntervalMs = PLAYER_POLLING_INTERVAL;
let lastRelTimeSec = 0;
let statusRefreshInFlight = false;

function normalizeUpnpState(state: string) {
  const normalized = state.trim().toUpperCase();
  if (normalized === 'PAUSED') return 'PAUSED_PLAYBACK';
  return normalized;
}

function getRelTimeSec() {
  return timeToSeconds(positionInfo.value.relTime);
}

function getTrackRelativeSec(relSec = getRelTimeSec()) {
  return Math.max(0, relSec - trackBaselineRelSec.value);
}

function hasActiveSession(deviceId: string) {
  return sessionDeviceId.value === deviceId;
}

function shouldKeepPolling(deviceId: string, state: string) {
  if (hasActiveSession(deviceId)) return true;
  if (playbackPendingDeviceId.value === deviceId) return true;
  const normalized = normalizeUpnpState(state);
  return normalized === 'PLAYING' || normalized === 'TRANSITIONING' || normalized === 'PAUSED_PLAYBACK';
}

function resolvePollingIntervalMs(deviceId: string, state: string) {
  if (hasActiveSession(deviceId) || playbackPendingDeviceId.value === deviceId || normalizeUpnpState(state) === 'TRANSITIONING') {
    return UPNP_FAST_POLLING_INTERVAL;
  }
  return PLAYER_POLLING_INTERVAL;
}

function resetInterpolation() {
  lastReportedRelSec.value = 0;
  lastReportedRelAt.value = 0;
}

function resetDeviceSync(baselineRelSec = 0) {
  trackBaselineRelSec.value = baselineRelSec;
  devicePlaybackConfirmed.value = false;
  lastRelTimeSec = baselineRelSec;
  frozenPositionSec.value = 0;
  resumeOffsetSec.value = 0;
  resetInterpolation();
}

function resetDeviceSyncFull() {
  resetDeviceSync(0);
  needsMopidyCalibration.value = true;
}

function shouldInterpolatePosition() {
  if (!devicePlaybackConfirmed.value) return false;
  const state = normalizeUpnpState(currentUpnpState.value);
  return state === 'PLAYING' || state === 'TRANSITIONING';
}

function noteRelTime(relSec: number) {
  if (relSec !== lastReportedRelSec.value) {
    lastReportedRelSec.value = relSec;
    lastReportedRelAt.value = performance.now();
  }
}

function getEffectiveRelSec() {
  if (!shouldInterpolatePosition() || lastReportedRelAt.value === 0) {
    return getRelTimeSec();
  }
  void uiTick.value;
  const elapsed = (performance.now() - lastReportedRelAt.value) / 1000;
  return lastReportedRelSec.value + Math.max(0, elapsed);
}

function stopUiTick() {
  if (uiTickId) {
    clearInterval(uiTickId);
    uiTickId = null;
  }
}

function ensureUiTick() {
  if (!shouldInterpolatePosition()) {
    stopUiTick();
    return;
  }
  if (uiTickId) return;
  uiTickId = setInterval(() => {
    uiTick.value++;
  }, POSITION_UI_TICK_INTERVAL);
}

function getDisplayPositionSec() {
  const state = normalizeUpnpState(currentUpnpState.value);
  const relSec = shouldInterpolatePosition() ? getEffectiveRelSec() : getRelTimeSec();
  const trackRelativeSec = getTrackRelativeSec(relSec);

  if (state === 'PAUSED_PLAYBACK') {
    if (!devicePlaybackConfirmed.value) {
      return frozenPositionSec.value;
    }
    return trackRelativeSec > 0 ? resumeOffsetSec.value + trackRelativeSec : frozenPositionSec.value;
  }

  if (!devicePlaybackConfirmed.value) {
    if (resumeOffsetSec.value > 0) {
      return resumeOffsetSec.value;
    }
    return frozenPositionSec.value;
  }

  return resumeOffsetSec.value + trackRelativeSec;
}

function confirmDeviceSync(relSec = getRelTimeSec()) {
  devicePlaybackConfirmed.value = true;
  lastRelTimeSec = relSec;
  clearPlaybackPending();
  noteRelTime(relSec);
  ensureUiTick();
}

function updateDeviceSync(relSec: number) {
  if (devicePlaybackConfirmed.value) {
    lastRelTimeSec = relSec;
    noteRelTime(relSec);
    return;
  }

  if (playbackPendingDeviceId.value != null) {
    if (relSec < lastRelTimeSec - 1) {
      trackBaselineRelSec.value = Math.max(0, relSec - frozenPositionSec.value);
      lastRelTimeSec = relSec;
      noteRelTime(relSec);
      return;
    }
    if (relSec > lastRelTimeSec) {
      confirmDeviceSync(relSec);
      return;
    }
  }

  lastRelTimeSec = relSec;
  noteRelTime(relSec);
}

function beginUpnpSession(deviceId: string) {
  sessionDeviceId.value = deviceId;
}

function endUpnpSession() {
  sessionDeviceId.value = null;
}

function markPlaybackPending(deviceId: string, trackPositionSec = 0) {
  const relSec = getRelTimeSec();
  playbackPendingDeviceId.value = deviceId;
  resumeOffsetSec.value = 0;
  trackBaselineRelSec.value = Math.max(0, relSec - trackPositionSec);
  devicePlaybackConfirmed.value = false;
  lastRelTimeSec = relSec;
  frozenPositionSec.value = trackPositionSec;
  resetInterpolation();
  noteRelTime(relSec);
  needsMopidyCalibration.value = false;
  beginUpnpSession(deviceId);
}

function markResumePending(deviceId: string, positionSec: number) {
  const relSec = getRelTimeSec();
  playbackPendingDeviceId.value = deviceId;
  resumeOffsetSec.value = positionSec;
  trackBaselineRelSec.value = relSec;
  devicePlaybackConfirmed.value = false;
  lastRelTimeSec = relSec;
  frozenPositionSec.value = positionSec;
  resetInterpolation();
  noteRelTime(relSec);
  needsMopidyCalibration.value = false;
  beginUpnpSession(deviceId);
}

function clearPlaybackPending() {
  playbackPendingDeviceId.value = null;
}

function stopStatusPolling() {
  if (pollingId) {
    clearInterval(pollingId);
    pollingId = null;
  }
  pollingDeviceId = null;
  stopUiTick();
}

const displayPositionSec = computed(() => getDisplayPositionSec());

const isDevicePlaying = computed(() => {
  if (!devicePlaybackConfirmed.value) return false;
  const state = normalizeUpnpState(currentUpnpState.value);
  return state === 'PLAYING' || state === 'TRANSITIONING';
});

const isDeviceBuffering = computed(() =>
  sessionDeviceId.value != null && !devicePlaybackConfirmed.value,
);

const hasActiveUpnpSession = computed(() => sessionDeviceId.value != null);

function scheduleStatusPolling(deviceId: string) {
  const interval = resolvePollingIntervalMs(deviceId, currentUpnpState.value);
  if (pollingId && (pollingDeviceId !== deviceId || pollingIntervalMs !== interval)) {
    stopStatusPolling();
  }
  pollingDeviceId = deviceId;
  pollingIntervalMs = interval;
  if (pollingId) return;
  void refreshStatus(deviceId);
  pollingId = setInterval(() => {
    void refreshStatus(deviceId);
  }, interval);
}

function ensureStatusPolling(deviceId: string) {
  if (!hasActiveSession(deviceId)) {
    beginUpnpSession(deviceId);
  }
  scheduleStatusPolling(deviceId);
}

async function refreshStatus(deviceId: string) {
  if (statusRefreshInFlight) return;
  statusRefreshInFlight = true;
  try {
    const info = await invoke<UpnpTransportInfo>('upnp_get_transport_info', { deviceId });
    currentUpnpState.value = info.currentTransportState;
    const pos = await invoke<UpnpPositionInfo>('upnp_get_position_info', { deviceId });
    positionInfo.value = pos;

    updateDeviceSync(getRelTimeSec());
    ensureUiTick();

    const state = currentUpnpState.value;
    if (shouldKeepPolling(deviceId, state)) {
      const nextInterval = resolvePollingIntervalMs(deviceId, state);
      if (pollingId && nextInterval !== pollingIntervalMs) {
        scheduleStatusPolling(deviceId);
      } else if (!pollingId) {
        scheduleStatusPolling(deviceId);
      }
    } else {
      endUpnpSession();
      clearPlaybackPending();
      resetDeviceSyncFull();
      stopStatusPolling();
    }
  } catch {
    if (!hasActiveSession(deviceId) && playbackPendingDeviceId.value !== deviceId) {
      stopStatusPolling();
      resetDeviceSyncFull();
    }
  } finally {
    statusRefreshInFlight = false;
  }
}

async function resyncWithMopidy(deviceId: string, mopidyPositionSec: number) {
  beginUpnpSession(deviceId);
  await refreshStatus(deviceId);

  const relSec = getRelTimeSec();
  const state = normalizeUpnpState(currentUpnpState.value);
  const baseline = Math.max(0, relSec - mopidyPositionSec);

  trackBaselineRelSec.value = baseline;
  lastRelTimeSec = relSec;
  frozenPositionSec.value = mopidyPositionSec;
  resumeOffsetSec.value = 0;

  if (state === 'PAUSED_PLAYBACK' || state === 'PLAYING' || state === 'TRANSITIONING') {
    confirmDeviceSync(relSec);
  } else {
    noteRelTime(relSec);
  }

  needsMopidyCalibration.value = false;
  ensureStatusPolling(deviceId);
}

async function recalibrateTrack(deviceId: string, trackPositionSec: number) {
  beginUpnpSession(deviceId);
  await refreshStatus(deviceId);

  const relSec = getRelTimeSec();
  const state = normalizeUpnpState(currentUpnpState.value);

  trackBaselineRelSec.value = Math.max(0, relSec - trackPositionSec);
  lastRelTimeSec = relSec;
  frozenPositionSec.value = trackPositionSec;
  resumeOffsetSec.value = 0;
  clearPlaybackPending();
  needsMopidyCalibration.value = false;

  if (state === 'PAUSED_PLAYBACK' || state === 'PLAYING' || state === 'TRANSITIONING') {
    confirmDeviceSync(relSec);
  } else {
    noteRelTime(relSec);
  }

  ensureStatusPolling(deviceId);
  return state;
}

export default function useUpnpPlayer() {
  async function setUriAndPlay(
    deviceId: string,
    uri: string,
    options: { resumeFromSec?: number, trackPositionSec?: number } = {},
  ) {
    if (options.resumeFromSec != null && options.resumeFromSec > 0) {
      markResumePending(deviceId, options.resumeFromSec);
    } else {
      markPlaybackPending(deviceId, options.trackPositionSec ?? 0);
    }
    const result = await invoke('upnp_set_uri_and_play', { deviceId, uri });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function play(deviceId: string) {
    const result = await invoke('upnp_play', { deviceId });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function resume(deviceId: string) {
    return play(deviceId);
  }

  async function pause(deviceId: string) {
    frozenPositionSec.value = displayPositionSec.value;
    stopUiTick();
    clearPlaybackPending();
    const result = await invoke('upnp_pause', { deviceId });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function stop(deviceId: string) {
    endUpnpSession();
    clearPlaybackPending();
    resetDeviceSyncFull();
    const result = await invoke('upnp_stop', { deviceId });
    stopStatusPolling();
    return result;
  }

  async function setVolume(deviceId: string, volume: number) {
    return await invoke('upnp_set_volume', { deviceId, level: volume });
  }

  async function getVolume(deviceId: string) {
    const vol = await invoke<number>('upnp_get_volume', { deviceId });
    currentVolume.value = vol;
    return vol;
  }

  function startStatusPolling(deviceId: string) {
    ensureStatusPolling(deviceId);
  }

  onUnmounted(() => stopStatusPolling());

  return {
    currentUpnpState,
    currentVolume,
    positionInfo,
    displayPositionSec,
    isDevicePlaying,
    isDeviceBuffering,
    hasActiveUpnpSession,
    needsMopidyCalibration,
    resyncWithMopidy,
    recalibrateTrack,
    setUriAndPlay,
    play,
    resume,
    pause,
    stop,
    setVolume,
    getVolume,
    refreshStatus,
    startStatusPolling,
    ensureStatusPolling,
    stopStatusPolling,
  };
}
