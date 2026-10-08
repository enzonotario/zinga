import type { UpnpPositionInfo, UpnpTransportInfo } from '~/types/playback';
import { invoke } from '@tauri-apps/api/core';
import { computed, ref } from 'vue';
import { PLAYER_POLLING_INTERVAL, POSITION_UI_TICK_INTERVAL, UPNP_FAST_POLLING_INTERVAL } from '~/constants/polling';
import { UPNP_DEFAULT_DEVICE_START_SEC, UPNP_STREAM_BUFFER_SEC } from '~/constants/upnp';
import { timeToSeconds } from '~/utils/time';
import useMopidy from './useMopidy';

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
const latencySec = ref(UPNP_STREAM_BUFFER_SEC + UPNP_DEFAULT_DEVICE_START_SEC);
const seekHold = ref<{ tlid: number, sec: number } | null>(null);
const needsSessionAttach = ref(true);
const uiTick = ref(0);

let pollingId: ReturnType<typeof setInterval> | null = null;
let uiTickId: ReturnType<typeof setInterval> | null = null;
let pollingDeviceId: string | null = null;
let pollingIntervalMs = PLAYER_POLLING_INTERVAL;
let lastRelTimeSec = 0;
let playAcknowledgedAt = 0;
let deviceStartedAt = Number.POSITIVE_INFINITY;
let statusRefreshInFlight = false;

function normalizeUpnpState(state: string) {
  const normalized = state.trim().toUpperCase();
  if (normalized === 'PAUSED') return 'PAUSED_PLAYBACK';
  return normalized;
}

function getRelTimeSec() {
  return timeToSeconds(positionInfo.value.relTime);
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

function resetDeviceSync() {
  devicePlaybackConfirmed.value = false;
  frozenPositionSec.value = 0;
  seekHold.value = null;
  playAcknowledgedAt = 0;
  deviceStartedAt = Number.POSITIVE_INFINITY;
  needsSessionAttach.value = true;
}

function stopUiTick() {
  if (uiTickId) {
    clearInterval(uiTickId);
    uiTickId = null;
  }
}

function ensureUiTick() {
  if (!sessionDeviceId.value) {
    stopUiTick();
    return;
  }
  if (uiTickId) return;
  uiTickId = setInterval(() => {
    uiTick.value++;
  }, POSITION_UI_TICK_INTERVAL);
}

function clearPlaybackPending() {
  playbackPendingDeviceId.value = null;
}

function updateDeviceSync(relSec: number, observedAt: number) {
  const changed = relSec !== lastRelTimeSec;
  lastRelTimeSec = relSec;
  if (!changed || relSec <= 0 || playAcknowledgedAt === 0) return;
  if (normalizeUpnpState(currentUpnpState.value) !== 'PLAYING') return;
  // RelTime has 1 s resolution, so each observed tick only bounds the real start from above
  deviceStartedAt = Math.min(deviceStartedAt, observedAt - relSec * 1000);
  latencySec.value = UPNP_STREAM_BUFFER_SEC + Math.max(0, deviceStartedAt - playAcknowledgedAt) / 1000;
  devicePlaybackConfirmed.value = true;
  clearPlaybackPending();
}

function beginUpnpSession(deviceId: string) {
  sessionDeviceId.value = deviceId;
}

function endUpnpSession() {
  sessionDeviceId.value = null;
}

function markPlaybackPending(deviceId: string, frozenSec: number) {
  playbackPendingDeviceId.value = deviceId;
  devicePlaybackConfirmed.value = false;
  frozenPositionSec.value = frozenSec;
  seekHold.value = null;
  playAcknowledgedAt = 0;
  deviceStartedAt = Number.POSITIVE_INFINITY;
  lastRelTimeSec = getRelTimeSec();
  needsSessionAttach.value = false;
  beginUpnpSession(deviceId);
}

function stopStatusPolling() {
  if (pollingId) {
    clearInterval(pollingId);
    pollingId = null;
  }
  pollingDeviceId = null;
  stopUiTick();
}

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
    const observedAt = performance.now();
    positionInfo.value = pos;

    updateDeviceSync(getRelTimeSec(), observedAt);
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
      resetDeviceSync();
      stopStatusPolling();
    }
  } catch {
    if (!hasActiveSession(deviceId) && playbackPendingDeviceId.value !== deviceId) {
      stopStatusPolling();
      resetDeviceSync();
    }
  } finally {
    statusRefreshInFlight = false;
  }
}

async function attachSession(deviceId: string) {
  beginUpnpSession(deviceId);
  await refreshStatus(deviceId);
  needsSessionAttach.value = false;
  ensureStatusPolling(deviceId);
  if (playbackPendingDeviceId.value) return;
  const state = normalizeUpnpState(currentUpnpState.value);
  if (state === 'PLAYING' || state === 'TRANSITIONING' || state === 'PAUSED_PLAYBACK') {
    devicePlaybackConfirmed.value = true;
  }
}

export default function useUpnpPlayer() {
  const mopidy = useMopidy();

  function getMopidyLiveSec() {
    const sec = mopidy.position.value / 1000;
    if (!mopidy.isPlaying.value) return sec;
    void uiTick.value;
    return sec + Math.max(0, performance.now() - mopidy.positionUpdatedAt.value) / 1000;
  }

  function getAudiblePositionSec() {
    const liveSec = getMopidyLiveSec();
    const audibleSec = Math.max(0, liveSec - latencySec.value);
    const hold = seekHold.value;
    if (hold && hold.tlid === mopidy.currentTrack.value?.tlid && liveSec >= hold.sec - 1 && audibleSec < hold.sec) {
      return hold.sec;
    }
    return audibleSec;
  }

  const displayPositionSec = computed(() => {
    if (!devicePlaybackConfirmed.value) return frozenPositionSec.value;
    return getAudiblePositionSec();
  });

  async function setUriAndPlay(deviceId: string, uri: string) {
    markPlaybackPending(deviceId, displayPositionSec.value);
    const result = await invoke('upnp_set_uri_and_play', { deviceId, uri });
    playAcknowledgedAt = performance.now();
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

  function holdSeek(sec: number) {
    const tlid = mopidy.currentTrack.value?.tlid;
    seekHold.value = tlid == null ? null : { tlid, sec };
  }

  async function pause(deviceId: string) {
    clearPlaybackPending();
    const result = await invoke('upnp_pause', { deviceId });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function stop(deviceId: string) {
    endUpnpSession();
    clearPlaybackPending();
    resetDeviceSync();
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

  return {
    currentUpnpState,
    currentVolume,
    positionInfo,
    displayPositionSec,
    isDevicePlaying,
    isDeviceBuffering,
    hasActiveUpnpSession,
    needsSessionAttach,
    attachSession,
    holdSeek,
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
    uiTick,
  };
}
