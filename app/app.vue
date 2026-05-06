<script setup lang="ts">
import { onMounted } from 'vue';
import useDevices from '~/composables/useDevices';
import useFeedSync from '~/composables/useFeedSync';

const { autoDiscover } = useDevices();
const { loadLastSyncTimes } = useFeedSync();
onMounted(async () => {
  await autoDiscover();
  await loadLastSyncTimes();
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
