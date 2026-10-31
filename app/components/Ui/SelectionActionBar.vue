<script lang="ts" setup>
interface Props {
  count: number
  disabled?: boolean
  playing?: boolean
}

withDefaults(defineProps<Props>(), {
  disabled: false,
  playing: false,
});

const emit = defineEmits<{
  play: []
  queue: []
  clear: []
}>();

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="count > 0"
      class="fixed bottom-24 left-1/2 z-50 -translate-x-1/2"
    >
      <div class="glass ring ring-default rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-lg">
        <span class="text-sm font-medium whitespace-nowrap">
          {{ t('selection.count', count) }}
        </span>
        <UButton
          icon="i-heroicons-play"
          :loading="playing"
          :disabled="disabled || playing"
          size="sm"
          @click="emit('play')"
        >
          {{ t('selection.play') }}
        </UButton>
        <UButton
          icon="i-heroicons-queue-list"
          variant="ghost"
          size="sm"
          :disabled="disabled || playing"
          @click="emit('queue')"
        >
          {{ t('selection.addToQueue') }}
        </UButton>
        <UButton
          icon="i-heroicons-x-mark"
          variant="ghost"
          size="sm"
          :aria-label="t('selection.clear')"
          @click="emit('clear')"
        >
          {{ t('selection.clear') }}
        </UButton>
      </div>
    </div>
  </Teleport>
</template>
