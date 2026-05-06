<script lang="ts" setup>
import { NO_NAV_CATEGORY } from '~/composables/pages';

definePageMeta({
  name: 'setup',
  nameKey: 'pages.setup.name',
  icon: 'i-heroicons-wrench-screwdriver',
  category: NO_NAV_CATEGORY,
  descriptionKey: 'pages.setup.description',
});
const { t } = useI18n();
const { status, loading, scriptRunning, scriptOutput, error, activeSession, allInstalled, allRunning, checkSystem, restartServices, openTerminal } = useSystemSetup();
const showOutput = ref(false);
onMounted(() => {
  checkSystem();
});
function serviceColor(service: { installed: boolean, running: boolean }) {
  if (!service.installed) return 'error';
  if (!service.running) return 'warning';
  return 'success';
}
function serviceLabel(service: { installed: boolean, running: boolean }) {
  if (!service.installed) return t('pages.setup.notInstalled');
  if (!service.running) return t('pages.setup.stopped');
  return t('pages.setup.running');
}
</script>

<template>
  <div class="min-h-full py-8">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-medium">
            {{ t('pages.setup.title') }}
          </h1>
          <div v-if="status">
            <UBadge v-if="allInstalled && allRunning" color="success" variant="subtle">
              {{ t('pages.setup.allGood') }}
            </UBadge>
            <UBadge v-else color="warning" variant="subtle">
              {{ t('pages.setup.issuesFound') }}
            </UBadge>
          </div>
        </div>
      </template>
      <div class="flex flex-col gap-6">
        <UAlert
          icon="i-heroicons-exclamation-triangle"
          color="warning"
          :title="t('pages.setup.setupWarning')"
        />
        <div v-if="status" class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UCard v-for="name in ['mopidy', 'icecast', 'ffmpeg'] as const" :key="name">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h3 class="font-medium capitalize">
                  {{ name }}
                </h3>
                <UBadge :color="serviceColor(status[name])" variant="subtle">
                  {{ serviceLabel(status[name]) }}
                </UBadge>
              </div>
              <p v-if="status[name].version" class="text-xs text-(--ui-text-muted) truncate">
                {{ status[name].version }}
              </p>
            </div>
          </UCard>
        </div>
        <div v-if="status" class="flex gap-4">
          <UBadge :color="status.mopidyConfigExists ? 'success' : 'error'" variant="subtle">
            {{ t('pages.setup.mopidyConfig') }}: {{ status.mopidyConfigExists ? t('pages.setup.configFound') : t('pages.setup.configMissing') }}
          </UBadge>
          <UBadge :color="status.icecastConfigExists ? 'success' : 'error'" variant="subtle">
            {{ t('pages.setup.icecastConfig') }}: {{ status.icecastConfigExists ? t('pages.setup.configFound') : t('pages.setup.configMissing') }}
          </UBadge>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            :loading="loading"
            @click="checkSystem"
          >
            {{ loading ? t('pages.setup.checking') : t('pages.setup.checkSystem') }}
          </UButton>
          <UButton
            icon="i-heroicons-play"
            variant="ghost"
            color="success"
            :loading="scriptRunning"
            @click="useSystemSetup().startServices()"
          >
            {{ t('pages.setup.startServices') }}
          </UButton>
          <UButton
            icon="i-heroicons-stop"
            variant="ghost"
            color="error"
            :loading="scriptRunning"
            @click="useSystemSetup().stopServices()"
          >
            {{ t('pages.setup.stopServices') }}
          </UButton>
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            color="warning"
            :loading="scriptRunning"
            @click="restartServices()"
          >
            {{ t('pages.setup.restartServices') }}
          </UButton>
          <UButton
            icon="i-heroicons-wrench-screwdriver"
            variant="ghost"
            color="warning"
            :loading="scriptRunning"
            @click="useSystemSetup().runSetup()"
          >
            {{ t('pages.setup.runSetup') }}
          </UButton>
          <UButton
            icon="i-heroicons-check-circle"
            variant="ghost"
            color="neutral"
            :loading="scriptRunning"
            @click="useSystemSetup().verify()"
          >
            {{ t('pages.setup.checkSystem') }}
          </UButton>
          <UButton
            v-if="activeSession"
            icon="i-heroicons-command-line"
            variant="ghost"
            color="neutral"
            @click="openTerminal()"
          >
            {{ t('pages.setup.openTerminal') }}
          </UButton>
        </div>
        <div v-if="error" class="text-sm text-(--ui-error)">
          {{ error }}
        </div>
        <div v-if="scriptOutput || scriptRunning">
          <button
            class="flex items-center gap-1 text-sm text-(--ui-text-muted) cursor-pointer mb-2"
            @click="showOutput = !showOutput"
          >
            <UIcon :name="showOutput ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'" class="w-4 h-4" />
            {{ t('pages.setup.output') }}
            <UIcon v-if="scriptRunning" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin ml-1" />
          </button>
          <pre
            v-if="showOutput"
            class="bg-(--ui-bg-elevated) text-sm p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto font-mono"
          >{{ scriptOutput }}</pre>
        </div>
      </div>
    </UCard>
  </div>
</template>
