<script setup lang="ts">
interface Props {
  isPlaying: boolean
  pauseAtEndOfTrack: boolean
  selectedDeviceId: string | null
  hasTrack: boolean
}
interface Emits {
  (e: 'previous'): void
  (e: 'togglePlayPause'): void
  (e: 'togglePauseAtEnd'): void
  (e: 'next'): void
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useI18n();

const pauseAtEndLabel = computed(() =>
  props.pauseAtEndOfTrack ? t('player.pauseAtEndActive') : t('player.pauseAtEnd'),
);
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      icon="i-heroicons-backward"
      variant="ghost"
      size="sm"
      :disabled="!props.selectedDeviceId || !props.hasTrack"
      @click="emit('previous')"
    />
    <UButton
      :icon="props.isPlaying ? 'i-heroicons-pause' : 'i-heroicons-play'"
      variant="solid"
      size="lg"
      :disabled="!props.selectedDeviceId"
      @click="emit('togglePlayPause')"
    />
    <UButton
      icon="i-heroicons-pause-circle"
      :variant="props.pauseAtEndOfTrack ? 'soft' : 'ghost'"
      size="sm"
      :color="props.pauseAtEndOfTrack ? 'primary' : 'neutral'"
      :disabled="!props.selectedDeviceId || !props.hasTrack"
      :aria-label="pauseAtEndLabel"
      :title="pauseAtEndLabel"
      @click="emit('togglePauseAtEnd')"
    />
    <UButton
      icon="i-heroicons-forward"
      variant="ghost"
      size="sm"
      :disabled="!props.selectedDeviceId || !props.hasTrack"
      @click="emit('next')"
    />
  </div>
</template>
