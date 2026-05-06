<script lang="ts" setup>
import useRemoteClient from '~/composables/useRemoteClient';

const { t } = useI18n();
const { isRemoteMode, serverUrl, connectionStatus, connect, disconnect, discoverServers } = useRemoteClient();
const ip = ref('');
const port = ref(9632);
const code = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const scanning = ref(false);
const hasSearched = ref(false);
const servers = ref<{ ip: string, port: number, name: string }[]>([]);
async function handleConnect() {
  if (!ip.value || !code.value) return;
  loading.value = true;
  error.value = null;
  try {
    await connect(ip.value, port.value, code.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
function handleDisconnect() {
  disconnect();
  ip.value = '';
  code.value = '';
  error.value = null;
}
async function handleSearch() {
  scanning.value = true;
  hasSearched.value = false;
  servers.value = [];
  try {
    servers.value = await discoverServers();
  } catch {
    servers.value = [];
  } finally {
    scanning.value = false;
    hasSearched.value = true;
  }
}
function selectServer(server: { ip: string, port: number }) {
  ip.value = server.ip;
  port.value = server.port;
}
const statusColor = computed(() => {
  switch (connectionStatus.value) {
  case 'connected': return 'success';
  case 'connecting': return 'warning';
  case 'error': return 'error';
  default: return 'neutral';
  }
});
const statusLabel = computed(() => {
  switch (connectionStatus.value) {
  case 'connected': return t('pages.settings.connected');
  case 'connecting': return t('pages.settings.connecting');
  case 'error': return t('pages.settings.connectionError');
  default: return t('pages.settings.disconnected');
  }
});
</script>

<template>
  <UCard variant="soft">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-signal" class="w-5 h-5 text-(--ui-text-muted)" />
        <h3 class="text-sm font-semibold">
          {{ t('pages.settings.remoteClient') }}
        </h3>
      </div>
    </template>
    <div class="space-y-4">
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('pages.settings.remoteClientDescription') }}
      </p>
      <template v-if="isRemoteMode">
        <div class="flex flex-col gap-3 p-3 rounded-lg bg-(--ui-bg-elevated)">
          <div class="flex items-center justify-between">
            <span class="text-sm text-(--ui-text-muted)">{{ t('pages.settings.connectionStatus') }}</span>
            <UBadge :color="statusColor" variant="subtle" size="sm">
              {{ statusLabel }}
            </UBadge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-(--ui-text-muted)">{{ t('pages.settings.serverAddress') }}</span>
            <span class="text-sm font-mono font-medium">{{ serverUrl }}</span>
          </div>
        </div>
        <UButton
          color="error"
          variant="soft"
          block
          @click="handleDisconnect"
        >
          {{ t('pages.settings.disconnectFromServer') }}
        </UButton>
      </template>
      <template v-else>
        <UButton
          variant="soft"
          block
          :loading="scanning"
          icon="i-heroicons-magnifying-glass"
          @click="handleSearch"
        >
          {{ scanning ? t('pages.settings.searching') : t('pages.settings.searchServers') }}
        </UButton>
        <div v-if="servers.length" class="space-y-2">
          <p class="text-xs font-medium text-(--ui-text-muted)">
            {{ t('pages.settings.serversFound') }}
          </p>
          <div
            v-for="server in servers"
            :key="server.ip"
            class="flex items-center justify-between p-2.5 rounded-lg bg-(--ui-bg-elevated) cursor-pointer hover:bg-(--ui-bg-elevated)/80 transition-colors"
            @click="selectServer(server)"
          >
            <div class="flex flex-col">
              <span class="text-sm font-medium">{{ server.name }}</span>
              <span class="text-xs text-(--ui-text-muted) font-mono">{{ server.ip }}:{{ server.port }}</span>
            </div>
            <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-(--ui-text-muted)" />
          </div>
        </div>
        <p v-else-if="hasSearched && !scanning" class="text-xs text-(--ui-text-muted)">
          {{ t('pages.settings.noServersFound') }}
        </p>
        <USeparator :label="t('pages.settings.orEnterManually')" />
        <UFormField :label="t('pages.settings.serverIp')">
          <UInput
            v-model="ip"
            placeholder="192.168.1.50"
            icon="i-heroicons-globe-alt"
          />
        </UFormField>
        <UFormField :label="t('pages.settings.serverPort')">
          <UInput
            v-model.number="port"
            type="number"
            placeholder="9632"
          />
        </UFormField>
        <UFormField :label="t('pages.settings.enterPairingCode')">
          <UInput
            v-model="code"
            placeholder="123456"
            icon="i-heroicons-key"
            maxlength="6"
          />
        </UFormField>
        <UAlert v-if="error" color="error" :title="error" />
        <UButton
          block
          :loading="loading"
          :disabled="!ip || !code"
          @click="handleConnect"
        >
          {{ t('pages.settings.connectToServer') }}
        </UButton>
      </template>
    </div>
  </UCard>
</template>
