<script lang="ts" setup>
import { computed } from 'vue';
import useRemoteClient from '~/composables/useRemoteClient';

const { t } = useI18n();
const { isRemoteMode, hasSavedSession, serverUrl, connectionStatus, setClientMode } = useRemoteClient();
const hostLabel = computed(() => serverUrl.value?.replace(/^https?:\/\//, '') || '');
const statusColor = computed(() => {
  if (connectionStatus.value === 'connected') return 'text-green-500';
  if (connectionStatus.value === 'error') return 'text-red-500';
  return 'text-amber-500';
});
function onToggle(enabled: boolean) {
  void setClientMode(enabled);
}
</script>

<template>
  <div v-if="hasSavedSession" class="flex items-center gap-2">
    <USwitch
      :model-value="isRemoteMode"
      size="sm"
      :aria-label="t('nav.clientMode')"
      @update:model-value="onToggle"
    />
    <div class="hidden sm:flex flex-col leading-tight min-w-0">
      <span class="text-sm font-medium">{{ t('nav.clientMode') }}</span>
      <span class="text-[11px] truncate max-w-36" :class="statusColor">{{ hostLabel }}</span>
    </div>
  </div>
</template>
