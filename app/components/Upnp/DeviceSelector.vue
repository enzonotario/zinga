<script setup lang="ts">
import { computed, ref } from 'vue';
import useDevices, { LOCAL_DEVICE_ID } from '../../composables/useDevices';
import DeviceModal from './DeviceModal.vue';

const { t } = useI18n();
const {
  selectedDevice,
  selectedDeviceId,
  devices,
  isLocalPlayback,
  select,
  selectLocal,
} = useDevices();
const localOption = computed(() => ({ id: LOCAL_DEVICE_ID, name: t('upnp.localPlayback') }));
const selectorItems = computed(() => [localOption.value, ...devices.value]);
const selectedDeviceLabel = computed(() => {
  if (isLocalPlayback.value) return t('upnp.localPlayback');
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
      size="sm"
      @update:model-value="onSelect"
    />
    <DeviceModal v-model="isModalOpen" />
  </div>
</template>
