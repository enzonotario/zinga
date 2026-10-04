<script setup lang="ts">
import { onMounted } from 'vue';
import useDevices from '~/composables/useDevices';
import useFeedSync from '~/composables/useFeedSync';
import useSystemSetup from '~/composables/useSystemSetup';

const { autoDiscover } = useDevices();
const { loadLastSyncTimes } = useFeedSync();
const { ensurePipeline, checkSystem } = useSystemSetup();
const { closeToTray, setCloseToTray } = useSettings();
onMounted(async () => {
  setCloseToTray(closeToTray.value);
  await autoDiscover();
  await loadLastSyncTimes();
  await checkSystem();
  await ensurePipeline(false).catch(() => {});
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
