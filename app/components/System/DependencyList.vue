<script lang="ts" setup>
import type { SystemCheck } from '~/composables/useSystemSetup';
import { useClipboard } from '@vueuse/core';
import { computed } from 'vue';
import useTerminalPanel from '~/composables/useTerminalPanel';

interface Props {
  status: SystemCheck
}
const props = defineProps<Props>();

const { t } = useI18n();
const { copy, copied } = useClipboard({ copiedDuring: 2000, legacy: true });
const terminalPanel = useTerminalPanel();

const dependencies = computed(() => [
  { name: 'ffmpeg', available: props.status.ffmpeg, description: t('pages.setup.ffmpegDescription') },
  ...props.status.gstreamerPlugins.map((plugin) => ({
    ...plugin,
    description: t('pages.setup.gstreamerPluginDescription'),
  })),
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <ul class="flex flex-col gap-2">
      <li
        v-for="dependency in dependencies"
        :key="dependency.name"
        class="flex items-center justify-between gap-2"
      >
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-mono">{{ dependency.name }}</span>
          <span class="text-xs text-(--ui-text-muted) truncate">{{ dependency.description }}</span>
        </div>
        <UBadge :color="dependency.available ? 'success' : 'error'" variant="subtle">
          {{ dependency.available ? t('pages.setup.available') : t('pages.setup.missing') }}
        </UBadge>
      </li>
    </ul>
    <div v-if="!status.ready" class="flex flex-col gap-2">
      <p class="text-sm">
        {{ t('pages.setup.installHint') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-1 min-w-60 items-center gap-2 glass-soft rounded-lg pr-1">
          <pre
            class="flex-1 min-w-0 text-xs p-3 overflow-x-auto font-mono"
            data-selectable
          >{{ status.installCommand }}</pre>
          <UTooltip :text="copied ? t('pages.setup.copied') : t('pages.setup.copyCommand')">
            <UButton
              :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
              :color="copied ? 'success' : 'neutral'"
              variant="ghost"
              size="sm"
              :aria-label="copied ? t('pages.setup.copied') : t('pages.setup.copyCommand')"
              @click="copy(status.installCommand)"
            />
          </UTooltip>
        </div>
        <UButton
          v-if="status.canRunInstall"
          icon="i-heroicons-command-line"
          size="sm"
          :loading="terminalPanel.starting.value"
          :disabled="terminalPanel.running.value"
          @click="terminalPanel.start('InstallDependencies')"
        >
          {{ t('pages.setup.runInTerminal') }}
        </UButton>
      </div>
      <UAlert
        v-if="terminalPanel.error.value && !terminalPanel.isOpen.value"
        color="error"
        variant="soft"
        :title="terminalPanel.error.value"
      />
    </div>
  </div>
</template>
