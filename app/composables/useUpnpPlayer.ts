import { invoke } from '@tauri-apps/api/core';
import { onUnmounted, ref } from 'vue';
import { PLAYER_POLLING_INTERVAL } from '~/constants/polling';

const currentUpnpState = ref<string>('STOPPED');
const currentVolume = ref<number>(0);
const positionInfo = ref({
  rel_time: '00:00:00',
  track_duration: '00:00:00',
});
const pollingId = ref<ReturnType<typeof setInterval> | null>(null);
let statusRefreshInFlight = false;

export default function useUpnpPlayer() {
  async function setUriAndPlay(deviceId: string, uri: string) {
    const result = await invoke('upnp_set_uri_and_play', { deviceId, uri });
    startStatusPolling(deviceId);
    return result;
  }
  async function play(deviceId: string) {
    return await invoke('upnp_play', { deviceId });
  }
  async function pause(deviceId: string) {
    return await invoke('upnp_pause', { deviceId });
  }
  async function stop(deviceId: string) {
    return await invoke('upnp_stop', { deviceId });
  }
  async function setVolume(deviceId: string, volume: number) {
    return await invoke('upnp_set_volume', { deviceId, level: volume });
  }
  async function getVolume(deviceId: string) {
    const vol = await invoke<number>('upnp_get_volume', { deviceId });
    currentVolume.value = vol;
    return vol;
  }
  async function refreshStatus(deviceId: string) {
    if (statusRefreshInFlight) return;
    statusRefreshInFlight = true;
    try {
      const info = await invoke<any>('upnp_get_transport_info', { deviceId });
      currentUpnpState.value = info.current_transport_state;
      const pos = await invoke<any>('upnp_get_position_info', { deviceId });
      positionInfo.value = pos;

      if (currentUpnpState.value !== 'PLAYING' && currentUpnpState.value !== 'TRANSITIONING') {
        stopStatusPolling();
      }
    } catch {
      stopStatusPolling();
    } finally {
      statusRefreshInFlight = false;
    }
  }
  function startStatusPolling(deviceId: string) {
    if (pollingId.value) return;
    refreshStatus(deviceId);
    pollingId.value = setInterval(refreshStatus, PLAYER_POLLING_INTERVAL, deviceId);
  }
  function stopStatusPolling() {
    if (pollingId.value) {
      clearInterval(pollingId.value);
      pollingId.value = null;
    }
  }
  onUnmounted(() => stopStatusPolling());
  return {
    currentUpnpState,
    currentVolume,
    positionInfo,
    setUriAndPlay,
    play,
    pause,
    stop,
    setVolume,
    getVolume,
    refreshStatus,
    startStatusPolling,
    stopStatusPolling,
  };
}
