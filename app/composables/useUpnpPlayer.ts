import type { UpnpPositionInfo, UpnpTransportInfo } from '~/types/playback';
import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';
import { PLAYER_POLLING_INTERVAL, POSITION_UI_TICK_INTERVAL, UPNP_FAST_POLLING_INTERVAL } from '~/constants/polling';

const currentUpnpState = ref<string>('STOPPED');
const positionInfo = ref<UpnpPositionInfo>({
  relTime: '00:00:00',
  trackDuration: '00:00:00',
  track: 0,
  absTime: '00:00:00',
  relCount: 0,
  absCount: 0,
});
const sessionDeviceId = ref<string | null>(null);
const uiTick = ref(0);

let pollingId: ReturnType<typeof setInterval> | null = null;
let uiTickId: ReturnType<typeof setInterval> | null = null;
let pollingDeviceId: string | null = null;
let pollingIntervalMs = PLAYER_POLLING_INTERVAL;
let statusRefreshInFlight = false;

function normalizeUpnpState(state: string) {
  const normalized = state.trim().toUpperCase();
  if (normalized === 'PAUSED') return 'PAUSED_PLAYBACK';
  return normalized;
}

function hasActiveSession(deviceId: string) {
  return sessionDeviceId.value === deviceId;
}

function shouldKeepPolling(deviceId: string, state: string) {
  if (hasActiveSession(deviceId)) return true;
  const normalized = normalizeUpnpState(state);
  return normalized === 'PLAYING' || normalized === 'TRANSITIONING' || normalized === 'PAUSED_PLAYBACK';
}

function resolvePollingIntervalMs(deviceId: string, state: string) {
  if (hasActiveSession(deviceId) || normalizeUpnpState(state) === 'TRANSITIONING') {
    return UPNP_FAST_POLLING_INTERVAL;
  }
  return PLAYER_POLLING_INTERVAL;
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

function stopStatusPolling() {
  if (pollingId) {
    clearInterval(pollingId);
    pollingId = null;
  }
  pollingDeviceId = null;
  stopUiTick();
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
  sessionDeviceId.value = deviceId;
  scheduleStatusPolling(deviceId);
}

async function refreshStatus(deviceId: string) {
  if (statusRefreshInFlight) return;
  statusRefreshInFlight = true;
  try {
    const info = await invoke<UpnpTransportInfo>('upnp_get_transport_info', { deviceId });
    currentUpnpState.value = info.currentTransportState;
    positionInfo.value = await invoke<UpnpPositionInfo>('upnp_get_position_info', { deviceId });
    ensureUiTick();

    const state = currentUpnpState.value;
    if (!shouldKeepPolling(deviceId, state)) {
      sessionDeviceId.value = null;
      stopStatusPolling();
      return;
    }
    if (!pollingId || resolvePollingIntervalMs(deviceId, state) !== pollingIntervalMs) {
      scheduleStatusPolling(deviceId);
    }
  } catch {
    if (!hasActiveSession(deviceId)) stopStatusPolling();
  } finally {
    statusRefreshInFlight = false;
  }
}

async function pause(deviceId: string) {
  const result = await invoke('upnp_pause', { deviceId });
  ensureStatusPolling(deviceId);
  return result;
}

async function stop(deviceId: string) {
  sessionDeviceId.value = null;
  const result = await invoke('upnp_stop', { deviceId });
  stopStatusPolling();
  return result;
}

export default function useUpnpPlayer() {
  return {
    currentUpnpState,
    positionInfo,
    pause,
    stop,
    ensureStatusPolling,
    uiTick,
  };
}
