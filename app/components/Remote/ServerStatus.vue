<script lang="ts" setup>
import useRemoteServer from '~/composables/useRemoteServer';

const { t } = useI18n();
const { isRunning, serverInfo, pairingUrl, loading, error, startServer, stopServer, refreshPairingCode } = useRemoteServer();
async function toggleServer() {
  if (isRunning.value) {
    await stopServer();
  } else {
    await startServer();
  }
}
</script>

<template>
  <UCard variant="soft">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-device-phone-mobile" class="w-5 h-5 text-(--ui-text-muted)" />
        <h3 class="text-sm font-semibold">
          {{ t('pages.settings.remoteServer') }}
        </h3>
      </div>
    </template>
    <div class="space-y-4">
      <UFormField
        :label="t('pages.settings.remoteServerEnabled')"
        :description="t('pages.settings.remoteServerDescription')"
      >
        <USwitch
          :model-value="isRunning"
          :loading="loading"
          @update:model-value="toggleServer"
        />
      </UFormField>
      <UAlert v-if="error" color="error" :title="error" />
      <template v-if="isRunning && serverInfo">
        <div class="flex flex-col gap-3 p-3 rounded-lg bg-(--ui-bg-elevated)">
          <div class="flex items-center justify-between">
            <span class="text-sm text-(--ui-text-muted)">{{ t('pages.settings.serverAddress') }}</span>
            <span class="text-sm font-mono font-medium">{{ serverInfo.ip }}:{{ serverInfo.port }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-(--ui-text-muted)">{{ t('pages.settings.pairingCode') }}</span>
            <div class="flex items-center gap-2">
              <span class="text-lg font-mono font-bold tracking-widest">{{ serverInfo.pairingCode }}</span>
              <UButton
                icon="i-heroicons-arrow-path"
                variant="ghost"
                size="xs"
                @click="refreshPairingCode"
              />
            </div>
          </div>
          <div class="flex flex-col items-center gap-2 pt-2 border-t border-(--ui-border)">
            <p class="text-xs text-(--ui-text-muted)">
              {{ t('pages.settings.scanQR') }}
            </p>
            <div class="p-2 bg-white rounded-lg">
              <img
                :src="`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pairingUrl || '')}`"
                :alt="t('pages.settings.scanQR')"
                class="w-[150px] h-[150px]"
              >
            </div>
            <p class="text-xs text-(--ui-text-muted) font-mono">
              {{ pairingUrl }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </UCard>
</template>
