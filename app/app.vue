<script setup lang="ts">
import { isTauri } from '@tauri-apps/api/core';
import { onMounted } from 'vue';
import useDevices, { LOCAL_DEVICE_ID } from '~/composables/useDevices';
import useDirectPlayer from '~/composables/useDirectPlayer';
import useFeedSync from '~/composables/useFeedSync';
import useRemoteClient from '~/composables/useRemoteClient';
import useRemoteHostBridge from '~/composables/useRemoteHostBridge';
import useSystemSetup from '~/composables/useSystemSetup';

const { autoDiscover, selectedDeviceId } = useDevices();
const { attachToRenderer } = useDirectPlayer();
const { isRemoteMode } = useRemoteClient();
const { loadLastSyncTimes } = useFeedSync();
const { status, checkSystem } = useSystemSetup();
const { closeToTray, setCloseToTray } = useSettings();
useRemoteHostBridge();
onMounted(async () => {
  setCloseToTray(closeToTray.value);
  await autoDiscover();
  if (isTauri() && !isRemoteMode.value) await attachToRenderer(selectedDeviceId.value ?? LOCAL_DEVICE_ID);
  await loadLastSyncTimes();
  await checkSystem();
  if (status.value && !status.value.ready) await navigateTo('/setup');
});
</script>

<template>
  <Html class="overflow-x-hidden">
    <Body class="font-sans antialiased">
      <UApp>
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>
