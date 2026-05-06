import type { Device } from '~/types/device';
import { invoke } from '@tauri-apps/api/core';
import { computed, ref, watch } from 'vue';
import { VOLUME_POLLING_INTERVAL, VOLUME_UPDATE_RESET_DELAY } from '~/constants/polling';
import useRemoteClient from './useRemoteClient';

export const LOCAL_DEVICE_ID = 'local';
const loading = ref(false);
const devices = ref<Device[]>([]);
const selectedDeviceId = ref<string | null>(null);
const services = ref<string[]>([]);
const volume = ref<number | null>(null);
const error = ref<string | null>('');
const selectedDevice = computed(() => devices.value.find((d) => d.id === selectedDeviceId.value));
const isLocalPlayback = computed(() => selectedDeviceId.value === LOCAL_DEVICE_ID);
const autoSearchCompleted = ref(false);
const volumePollingInterval = ref<ReturnType<typeof setInterval> | null>(null);
const isUpdatingVolumeFromDevice = ref(false);
const isPollingPaused = ref(false);
let upnpVolumePollInFlight = false;
if (import.meta.client) {
  const lastDeviceId = localStorage.getItem('lastSelectedDevice');
  if (lastDeviceId) {
    selectedDeviceId.value = lastDeviceId;
  }
}
function clearInvalidSelection() {
  selectedDeviceId.value = null;
  services.value = [];
  volume.value = null;
  if (import.meta.client) {
    localStorage.removeItem('lastSelectedDevice');
  }
}
function syncSelectionWithDevices(availableDevices: Device[]) {
  const currentId = selectedDeviceId.value;
  if (!currentId || currentId === LOCAL_DEVICE_ID) return;
  const exists = availableDevices.some((device) => device.id === currentId);
  if (!exists) {
    clearInvalidSelection();
  }
}
function initializeVolumePolling() {
  if (import.meta.client) {
    watch(selectedDeviceId, (newId) => {
      if (volumePollingInterval.value) {
        clearInterval(volumePollingInterval.value);
        volumePollingInterval.value = null;
      }
      if (newId && newId !== LOCAL_DEVICE_ID) {
        volumePollingInterval.value = setInterval(async () => {
          if (
            !selectedDeviceId.value
            || isUpdatingVolumeFromDevice.value
            || isPollingPaused.value
            || upnpVolumePollInFlight
          ) {
            return;
          }
          upnpVolumePollInFlight = true;
          try {
            const newVolume = await invoke<number>('upnp_get_volume', { deviceId: selectedDeviceId.value });
            if (volume.value !== newVolume) {
              volume.value = newVolume;
            }
          } catch {
          } finally {
            upnpVolumePollInFlight = false;
          }
        }, VOLUME_POLLING_INTERVAL);
      } else {
        volume.value = null;
      }
    }, { immediate: true });
  }
}
if (import.meta.client) {
  initializeVolumePolling();
}
export default function useDevices() {
  const { t } = useI18n();
  const remote = useRemoteClient();
  async function discover() {
    if (remote.isRemoteMode.value) {
      loading.value = true;
      try {
        const result = await remote.apiFetch('/api/devices');
        devices.value = result.devices || [];
        syncSelectionWithDevices(devices.value);
        autoSearchCompleted.value = true;
      } catch (e) {
        error.value = (e as Error).message || t('devices.errorSearchingRemote');
      } finally {
        loading.value = false;
      }
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      devices.value = await invoke<Device[]>('upnp_discover');
      autoSearchCompleted.value = true;
      syncSelectionWithDevices(devices.value);
      if (devices.value.length === 1 && !selectedDeviceId.value) {
        await select(devices.value[0].id);
      }
    } catch (e) {
      error.value = (e as Error).message || t('devices.errorDiscoveringUpnp');
    } finally {
      loading.value = false;
    }
  }
  async function select(deviceId: string | null) {
    if (!deviceId) {
      selectedDeviceId.value = null;
      volume.value = null;
      return;
    }
    selectedDeviceId.value = deviceId;
    if (import.meta.client) {
      localStorage.setItem('lastSelectedDevice', deviceId);
    }
    if (deviceId !== LOCAL_DEVICE_ID) {
      try {
        await invoke('upnp_connect', { deviceId });
        services.value = await invoke<string[]>('upnp_get_services', { deviceId });
        volume.value = await invoke<number>('upnp_get_volume', { deviceId }).catch(() => null);
      } catch (e) {
        console.error('Failed to select device:', e);
      }
    } else {
      services.value = [];
      try {
        const mopidyVolume = await invoke<number>('mopidy_rpc', {
          method: 'core.mixer.get_volume',
          params: {},
        });
        volume.value = mopidyVolume;
      } catch {
        volume.value = null;
      }
    }
  }
  async function setVolume(level: number) {
    if (!selectedDeviceId.value) return;
    if (isLocalPlayback.value) {
      try {
        await invoke('mopidy_rpc', {
          method: 'core.mixer.set_volume',
          params: { volume: level },
        });
        volume.value = level;
      } catch (e) {
        console.error('Failed to set local volume:', e);
      }
      return;
    }
    try {
      isUpdatingVolumeFromDevice.value = true;
      await invoke('upnp_set_volume', { deviceId: selectedDeviceId.value, level });
      volume.value = level;
      setTimeout(() => {
        isUpdatingVolumeFromDevice.value = false;
      }, VOLUME_UPDATE_RESET_DELAY);
    } catch (e) {
      console.error('Failed to set volume:', e);
      isUpdatingVolumeFromDevice.value = false;
    }
  }
  function selectLocal() {
    return select(LOCAL_DEVICE_ID);
  }
  async function autoDiscover() {
    if (!autoSearchCompleted.value) {
      await discover();
    }
  }
  function decreaseVolume() {
    const currentVol = volume.value ?? 0;
    const newVol = Math.max(0, currentVol - 1);
    setVolume(newVol);
  }
  function increaseVolume() {
    const currentVol = volume.value ?? 0;
    const newVol = Math.min(100, currentVol + 1);
    setVolume(newVol);
  }
  return {
    loading,
    devices,
    selectedDeviceId,
    services,
    volume,
    error,
    selectedDevice,
    isLocalPlayback,
    autoSearchCompleted,
    discover,
    select,
    selectLocal,
    autoDiscover,
    setVolume,
    decreaseVolume,
    increaseVolume,
    pauseVolumePolling: () => (isPollingPaused.value = true),
    resumeVolumePolling: () => (isPollingPaused.value = false),
  };
}
