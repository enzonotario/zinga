<script setup lang="ts">
import { computed, ref } from 'vue';
import useDevices, { LOCAL_DEVICE_ID } from '../../composables/useDevices';
import useRemoteClient from '../../composables/useRemoteClient';
import DeviceModal from './DeviceModal.vue';

const { t } = useI18n();
const remote = useRemoteClient();
const {
  selectedDevice,
  selectedDeviceId,
  devices,
  isLocalPlayback,
  select,
  selectLocal,
} = useDevices();
const localOption = computed(() => ({
  id: LOCAL_DEVICE_ID,
  name: remote.isRemoteMode.value ? t('pages.devices.remoteLocalOption') : t('upnp.localPlayback'),
  description: remote.isRemoteMode.value ? t('pages.devices.remoteLocalDescription') : undefined,
}));
const selectorItems = computed(() => {
  const outputs = remote.isRemoteMode.value
    ? devices.value.map((device) => ({ ...device, description: t('pages.devices.remoteOutput') }))
    : devices.value;
  const items = [localOption.value, ...outputs];
  if (!remote.isRemoteMode.value) return items;
  return [{ type: 'label' as const, name: t('pages.devices.remoteSection') }, ...items];
});
const selectedDeviceLabel = computed(() => {
  if (isLocalPlayback.value) return remote.isRemoteMode.value ? t('pages.devices.remoteLocalOption') : t('upnp.localPlayback');
  return selectedDevice.value?.name || t('upnp.selectDevicePlaceholder');
});
const isModalOpen = ref(false);
function onSelect(deviceId: string) {
  if (deviceId === LOCAL_DEVICE_ID) {
    selectLocal();
  } else {
    select(deviceId);
  }
}
</script>

<template>
  <div class="flex items-center gap-2 w-full max-w-md">
    <USelect
      v-model="selectedDeviceId"
      :items="selectorItems"
      label-key="name"
      value-key="id"
      :placeholder="selectedDeviceLabel"
      class="flex-1 max-w-40"
      :content="remote.isRemoteMode.value ? { class: 'min-w-64' } : undefined"
      size="sm"
      @update:model-value="onSelect"
    />
    <DeviceModal v-model="isModalOpen" />
  </div>
</template>
