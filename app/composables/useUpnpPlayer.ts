import type { UpnpPositionInfo, UpnpTransportInfo } from '~/types/playback';
import { invoke } from '@tauri-apps/api/core';
import { computed, onUnmounted, ref } from 'vue';
import { PLAYER_POLLING_INTERVAL, UPNP_FAST_POLLING_INTERVAL } from '~/constants/polling';
import { timeToSeconds } from '~/utils/time';

const PENDING_PLAYBACK_GRACE_MS = 2000;

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
const playbackSyncAnchorMs = ref<number | null>(null);
const frozenPositionSec = ref(0);
const wallClockPositionSec = ref(0);

let pollingId: ReturnType<typeof setInterval> | null = null;
let pollingDeviceId: string | null = null;
let pollingIntervalMs = PLAYER_POLLING_INTERVAL;
let positionTickId: ReturnType<typeof setInterval> | null = null;
let pendingSinceMs: number | null = null;
let statusRefreshInFlight = false;

function normalizeUpnpState(state: string) {
  const normalized = state.trim().toUpperCase();
  if (normalized === 'PAUSED') return 'PAUSED_PLAYBACK';
  return normalized;
}

function isUpnpPlayingState(state: string) {
  return normalizeUpnpState(state) === 'PLAYING';
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

function updateWallClockPosition() {
  if (playbackSyncAnchorMs.value == null) return;
  wallClockPositionSec.value = Math.max(0, (Date.now() - playbackSyncAnchorMs.value) / 1000);
}

function startPositionTick() {
  if (positionTickId) return;
  updateWallClockPosition();
  positionTickId = setInterval(updateWallClockPosition, UPNP_FAST_POLLING_INTERVAL);
}

function stopPositionTick() {
  if (positionTickId) {
    clearInterval(positionTickId);
    positionTickId = null;
  }
}

function beginDevicePlayback(continueFromSec = 0) {
  if (playbackSyncAnchorMs.value != null) return;
  playbackSyncAnchorMs.value = Date.now() - continueFromSec * 1000;
  updateWallClockPosition();
  startPositionTick();
}

function freezeCurrentPosition() {
  const relSec = getRelTimeSec();
  if (relSec > 0) {
    frozenPositionSec.value = relSec;
    return;
  }
  if (playbackSyncAnchorMs.value != null) {
    frozenPositionSec.value = wallClockPositionSec.value;
  }
}

function clearPlaybackSync() {
  playbackSyncAnchorMs.value = null;
  frozenPositionSec.value = 0;
  wallClockPositionSec.value = 0;
  stopPositionTick();
}

function beginUpnpSession(deviceId: string) {
  sessionDeviceId.value = deviceId;
}

function endUpnpSession() {
  sessionDeviceId.value = null;
}

function markPlaybackPending(deviceId: string) {
  playbackPendingDeviceId.value = deviceId;
  pendingSinceMs = Date.now();
  clearPlaybackSync();
  beginUpnpSession(deviceId);
}

function clearPlaybackPending() {
  playbackPendingDeviceId.value = null;
  pendingSinceMs = null;
}

function stopStatusPolling() {
  if (pollingId) {
    clearInterval(pollingId);
    pollingId = null;
  }
  pollingDeviceId = null;
}

const displayPositionSec = computed(() => {
  const tick = wallClockPositionSec.value;
  const state = normalizeUpnpState(currentUpnpState.value);
  const relSec = getRelTimeSec();

  if (relSec > 0) {
    return relSec;
  }

  if (state === 'PAUSED_PLAYBACK') {
    return frozenPositionSec.value;
  }

  if (playbackSyncAnchorMs.value != null) {
    return tick;
  }

  return 0;
});

const isDevicePlaying = computed(() => {
  const state = normalizeUpnpState(currentUpnpState.value);
  if (state === 'PLAYING') return true;
  if (getRelTimeSec() > 0 && sessionDeviceId.value != null) return true;
  return playbackSyncAnchorMs.value != null && (state === 'PLAYING' || state === 'TRANSITIONING');
});

const isDeviceBuffering = computed(() =>
  sessionDeviceId.value != null
  && playbackPendingDeviceId.value != null
  && getRelTimeSec() <= 0
  && playbackSyncAnchorMs.value == null,
);

const hasActiveUpnpSession = computed(() => sessionDeviceId.value != null);

function maybeBeginPlaybackFromStatus(state: string, deviceId: string) {
  const relSec = getRelTimeSec();
  if (relSec > 0) {
    beginDevicePlayback(relSec);
    clearPlaybackPending();
    return;
  }

  if (playbackPendingDeviceId.value !== deviceId) return;

  const normalized = normalizeUpnpState(state);
  const pendingForMs = pendingSinceMs ? Date.now() - pendingSinceMs : 0;

  if (normalized === 'PLAYING') {
    beginDevicePlayback(0);
    clearPlaybackPending();
    return;
  }

  if ((normalized === 'TRANSITIONING' || normalized === 'STOPPED' || normalized === 'PAUSED_PLAYBACK')
    && pendingForMs >= PENDING_PLAYBACK_GRACE_MS) {
    beginDevicePlayback(0);
    clearPlaybackPending();
  }
}

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

    const state = currentUpnpState.value;
    maybeBeginPlaybackFromStatus(state, deviceId);

    if (isUpnpPlayingState(state) && playbackSyncAnchorMs.value == null) {
      beginDevicePlayback(getRelTimeSec());
    }

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
      clearPlaybackSync();
      stopStatusPolling();
    }
  } catch {
    if (!hasActiveSession(deviceId) && playbackPendingDeviceId.value !== deviceId) {
      stopStatusPolling();
      clearPlaybackSync();
    }
  } finally {
    statusRefreshInFlight = false;
  }
}

export default function useUpnpPlayer() {
  async function setUriAndPlay(deviceId: string, uri: string) {
    markPlaybackPending(deviceId);
    const result = await invoke('upnp_set_uri_and_play', { deviceId, uri });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function play(deviceId: string) {
    markPlaybackPending(deviceId);
    const result = await invoke('upnp_play', { deviceId });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function pause(deviceId: string) {
    freezeCurrentPosition();
    clearPlaybackPending();
    playbackSyncAnchorMs.value = null;
    stopPositionTick();
    const result = await invoke('upnp_pause', { deviceId });
    ensureStatusPolling(deviceId);
    return result;
  }

  async function stop(deviceId: string) {
    endUpnpSession();
    clearPlaybackPending();
    clearPlaybackSync();
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

  onUnmounted(() => {
    stopStatusPolling();
    stopPositionTick();
  });

  return {
    currentUpnpState,
    currentVolume,
    positionInfo,
    displayPositionSec,
    isDevicePlaying,
    isDeviceBuffering,
    hasActiveUpnpSession,
    setUriAndPlay,
    play,
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
