<script lang="ts" setup>
import useRemoteServer from '~/composables/useRemoteServer';

const { t } = useI18n();
const { pairedDevices, isRunning, revokeDevice, refreshPairedDevices } = useRemoteServer();
onMounted(() => {
  if (isRunning.value) {
    refreshPairedDevices();
  }
});
</script>

<template>
  <UCard v-if="isRunning" variant="soft">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-device-tablet" class="w-5 h-5 text-(--ui-text-muted)" />
        <h3 class="text-sm font-semibold">
          {{ t('pages.settings.pairedDevices') }}
        </h3>
      </div>
    </template>
    <div v-if="pairedDevices.length === 0" class="text-sm text-(--ui-text-muted)">
      {{ t('pages.settings.noDevicesPaired') }}
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="device in pairedDevices"
        :key="device.id"
        class="flex items-center justify-between p-2 rounded-lg bg-(--ui-bg-elevated)"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-device-phone-mobile" class="w-4 h-4 text-(--ui-text-muted)" />
          <div>
            <p class="text-sm font-medium">
              {{ device.name }}
            </p>
            <p class="text-xs text-(--ui-text-muted)">
              {{ new Date(device.pairedAt * 1000).toLocaleDateString() }}
            </p>
          </div>
        </div>
        <UButton
          icon="i-heroicons-trash"
          variant="ghost"
          color="error"
          size="xs"
          :aria-label="t('pages.settings.revokeDevice')"
          @click="revokeDevice(device.id)"
        />
      </div>
    </div>
  </UCard>
</template>
