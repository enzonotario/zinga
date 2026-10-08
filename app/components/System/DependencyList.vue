<script lang="ts" setup>
import type { SystemCheck } from '~/composables/useSystemSetup';
import { computed } from 'vue';
import { INSTALL_HINT } from '~/composables/useSystemSetup';

interface Props {
  status: SystemCheck
}
const props = defineProps<Props>();

const { t } = useI18n();

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
      <pre class="glass-soft text-xs p-3 rounded-lg overflow-x-auto font-mono select-all">{{ INSTALL_HINT }}</pre>
    </div>
  </div>
</template>
