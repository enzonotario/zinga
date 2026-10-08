import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';
import { POSITION_UI_TICK_INTERVAL, UPNP_FAST_POLLING_INTERVAL } from '~/constants/polling';

export interface RendererStatus {
  state: string
  trackUri: string
  positionSec: number
}

const LOCAL_VOLUME_KEY = 'localVolume';
const status = ref<RendererStatus>({ state: 'STOPPED', trackUri: '', positionSec: 0 });
const tick = ref(0);
let pollingId: ReturnType<typeof setInterval> | null = null;
let tickId: ReturnType<typeof setInterval> | null = null;
let statusRequest: Promise<void> | null = null;
let storedVolumeApplied = false;

function stopPolling() {
  if (pollingId) {
    clearInterval(pollingId);
    pollingId = null;
  }
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function refreshStatus() {
  statusRequest ??= invoke<RendererStatus>('local_get_status')
    .then((next) => {
      status.value = next;
      if (next.state === 'STOPPED') stopPolling();
    })
    .catch((err) => console.error('Local renderer status error:', err))
    .finally(() => {
      statusRequest = null;
    });
  return statusRequest;
}

async function freshStatus() {
  await statusRequest;
  await refreshStatus();
}

function ensurePolling() {
  if (pollingId) return;
  void refreshStatus();
  pollingId = setInterval(() => void refreshStatus(), UPNP_FAST_POLLING_INTERVAL);
  tickId = setInterval(() => {
    tick.value++;
  }, POSITION_UI_TICK_INTERVAL);
}

async function play(uri: string) {
  if (!storedVolumeApplied) {
    storedVolumeApplied = true;
    const stored = getStoredVolume();
    if (stored != null) await invoke('local_set_volume', { level: stored });
  }
  await invoke('local_play', { uri });
  await freshStatus();
}

async function setNext(uri: string | null) {
  await invoke('local_set_next', { uri });
}

async function pause() {
  await invoke('local_pause');
}

async function resume() {
  await invoke('local_resume');
  ensurePolling();
}

async function stop() {
  stopPolling();
  await invoke('local_stop');
  await freshStatus();
}

function getStoredVolume() {
  const stored = localStorage.getItem(LOCAL_VOLUME_KEY);
  if (stored == null) return null;
  const level = Number(stored);
  return Number.isFinite(level) ? level : null;
}

async function setVolume(level: number) {
  await invoke('local_set_volume', { level });
  storedVolumeApplied = true;
  localStorage.setItem(LOCAL_VOLUME_KEY, String(level));
}

async function getVolume() {
  return storedVolumeApplied ? invoke<number>('local_get_volume') : getStoredVolume() ?? invoke<number>('local_get_volume');
}

export default function useLocalRenderer() {
  return {
    status,
    tick,
    ensurePolling,
    stopPolling,
    play,
    setNext,
    pause,
    resume,
    stop,
    setVolume,
    getVolume,
  };
}
