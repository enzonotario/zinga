<script setup lang="ts">
interface Props {
  isPlaying: boolean
  selectedDeviceId: string | null
  hasTrack: boolean
}
interface Emits {
  (e: 'previous'): void
  (e: 'togglePlayPause'): void
  (e: 'next'): void
}
defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      icon="i-heroicons-backward"
      variant="ghost"
      size="sm"
      :disabled="!selectedDeviceId || !hasTrack"
      @click="emit('previous')"
    />
    <UButton
      :icon="isPlaying ? 'i-heroicons-pause' : 'i-heroicons-play'"
      variant="solid"
      size="lg"
      :disabled="!selectedDeviceId"
      @click="emit('togglePlayPause')"
    />
    <UButton
      icon="i-heroicons-forward"
      variant="ghost"
      size="sm"
      :disabled="!selectedDeviceId || !hasTrack"
      @click="emit('next')"
    />
  </div>
</template>
