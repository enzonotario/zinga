<script lang="ts" setup>
const { t } = useI18n();
const { debugMode } = useSettings();
const { status, loading, scriptRunning, error, activeSession, checkSystem, runSetup, startServices, stopServices, restartServices, verify, runUninstall, openTerminal } = useSystemSetup();
const terminalDiag = ref('');
onMounted(() => {
  if (!status.value) checkSystem();
});
const services = computed(() => {
  if (!status.value) return [];
  return [
    { name: 'Mopidy', status: status.value.mopidy },
    { name: 'Icecast', status: status.value.icecast },
    { name: 'ffmpeg', status: status.value.ffmpeg },
  ];
});
function dotColor(service: { installed: boolean, running: boolean }) {
  if (!service.installed) return 'bg-red-500';
  if (!service.running) return 'bg-yellow-500';
  return 'bg-green-500';
}
async function runTerminalDiag() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    terminalDiag.value = await invoke<string>('debug_terminal');
  } catch (e: any) {
    terminalDiag.value = e?.toString() ?? t('setup.unknownError');
  }
}
async function openMopidyConfig() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('shell_open', { path: 'http://localhost:8989' });
  } catch {
    if (typeof window !== 'undefined') {
      window.open('http://localhost:8989', '_blank');
    }
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="status" class="flex flex-col gap-2">
      <div
        v-for="s in services"
        :key="s.name"
        class="flex items-center justify-between py-1"
      >
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="dotColor(s.status)" />
          <span class="text-sm">{{ s.name }}</span>
        </div>
        <span v-if="s.status.version" class="text-xs text-(--ui-text-muted) truncate max-w-48">
          {{ s.status.version }}
        </span>
      </div>
    </div>
    <div v-else-if="loading" class="text-sm text-(--ui-text-muted)">
      {{ t('pages.setup.checking') }}
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton
        size="sm"
        icon="i-heroicons-play"
        variant="ghost"
        :loading="scriptRunning"
        @click="startServices()"
      >
        {{ t('pages.setup.startServices') }}
      </UButton>
      <UButton
        size="sm"
        icon="i-heroicons-stop"
        variant="ghost"
        color="error"
        :loading="scriptRunning"
        @click="stopServices()"
      >
        {{ t('pages.setup.stopServices') }}
      </UButton>
      <UButton
        size="sm"
        icon="i-heroicons-arrow-path"
        variant="ghost"
        color="warning"
        :loading="scriptRunning"
        @click="restartServices()"
      >
        {{ t('pages.setup.restartServices') }}
      </UButton>
      <UButton
        size="sm"
        icon="i-heroicons-arrow-path"
        variant="ghost"
        color="neutral"
        :loading="loading"
        @click="verify()"
      >
        {{ t('pages.setup.checkSystem') }}
      </UButton>
      <UButton
        size="sm"
        icon="i-heroicons-arrow-down-tray"
        variant="ghost"
        color="neutral"
        :loading="scriptRunning"
        @click="runSetup()"
      >
        {{ t('pages.setup.install') }}
      </UButton>
      <UButton
        size="sm"
        icon="i-heroicons-trash"
        variant="ghost"
        color="error"
        :loading="scriptRunning"
        @click="runUninstall()"
      >
        {{ t('pages.setup.uninstall') }}
      </UButton>
      <UButton
        size="sm"
        icon="i-heroicons-globe-alt"
        variant="ghost"
        color="neutral"
        @click="openMopidyConfig()"
      >
        {{ t('common.configureMopidy') }}
      </UButton>
      <UButton
        v-if="activeSession"
        size="sm"
        icon="i-heroicons-command-line"
        variant="ghost"
        color="neutral"
        @click="openTerminal()"
      >
        {{ t('pages.setup.openTerminal') }}
      </UButton>
    </div>
    <UAlert v-if="error" color="error" :title="error" />
    <div v-if="debugMode" class="flex flex-col gap-2">
      <UCollapsible>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-heroicons-bug-ant"
        >
          {{ t('pages.setup.debugDetails') }}
        </UButton>
        <template #content>
          <div class="mt-2 flex flex-col gap-2">
            <div v-if="error" class="text-xs">
              <span class="font-medium text-(--ui-text-muted)">{{ t('pages.setup.errorDetails') }}:</span>
              <pre class="mt-1 p-2 rounded bg-(--ui-bg-muted) text-xs whitespace-pre-wrap break-all">{{ error }}</pre>
            </div>
            <UButton size="xs" variant="ghost" color="neutral" @click="runTerminalDiag()">
              {{ t('common.diagnoseTerminal') }}
            </UButton>
            <pre v-if="terminalDiag" class="p-2 rounded bg-(--ui-bg-muted) text-xs whitespace-pre-wrap break-all">{{ terminalDiag }}</pre>
          </div>
        </template>
      </UCollapsible>
    </div>
    <NuxtLink to="/setup" class="text-sm text-primary hover:underline">
      {{ t('pages.setup.goToSetup') }}
    </NuxtLink>
  </div>
</template>
