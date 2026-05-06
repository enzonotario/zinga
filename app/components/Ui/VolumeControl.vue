<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { POLLING_RESUME_DELAY } from '~/constants/polling';

interface Props {
  volume: number | null
  selectedDeviceId: string | null
}
interface Emits {
  (e: 'update:volume', value: number): void
  (e: 'decrease'): void
  (e: 'increase'): void
  (e: 'pausePolling'): void
  (e: 'resumePolling'): void
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const containerRef = ref<HTMLElement | null>(null);
const volumeDisplay = computed(() => props.volume ?? 0);
const resumePollingTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const pausePolling = () => {
  emit('pausePolling');
  if (resumePollingTimeout.value) {
    clearTimeout(resumePollingTimeout.value);
  }
};
const scheduleResumePolling = () => {
  if (resumePollingTimeout.value) {
    clearTimeout(resumePollingTimeout.value);
  }
  resumePollingTimeout.value = setTimeout(() => {
    emit('resumePolling');
    resumePollingTimeout.value = null;
  }, POLLING_RESUME_DELAY);
};
const handleVolumeChange = (value: number | undefined) => {
  if (value !== undefined) {
    pausePolling();
    emit('update:volume', value);
    scheduleResumePolling();
  }
};
const handleDecrease = () => {
  pausePolling();
  emit('decrease');
  scheduleResumePolling();
};
const handleIncrease = () => {
  pausePolling();
  emit('increase');
  scheduleResumePolling();
};
const adjustVolume = (delta: number) => {
  if (!props.selectedDeviceId) return;
  pausePolling();
  const currentVol = props.volume ?? 0;
  const newVol = Math.max(0, Math.min(100, currentVol + delta));
  if (newVol !== currentVol) {
    handleVolumeChange(newVol);
  }
  scheduleResumePolling();
};
const handleWheel = (event: WheelEvent) => {
  if (!props.selectedDeviceId) return;
  event.preventDefault();
  event.stopPropagation();
  const delta = event.deltaY > 0 ? -1 : 1;
  adjustVolume(delta);
};
const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.selectedDeviceId) return;
  const isFocused = document.activeElement === containerRef.value;
  if (!isFocused) return;
  switch (event.key) {
  case 'ArrowUp':
  case 'ArrowRight':
    event.preventDefault();
    event.stopPropagation();
    adjustVolume(1);
    break;
  case 'ArrowDown':
  case 'ArrowLeft':
    event.preventDefault();
    event.stopPropagation();
    adjustVolume(-1);
    break;
  }
};
onMounted(() => {
  if (containerRef.value) {
    containerRef.value.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
  }
});
onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('wheel', handleWheel);
    window.removeEventListener('keydown', handleKeyDown);
  }
  if (resumePollingTimeout.value) {
    clearTimeout(resumePollingTimeout.value);
    emit('resumePolling');
  }
});
</script>

<template>
  <div
    ref="containerRef"
    tabindex="0"
    role="slider"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="volumeDisplay"
    :aria-label="$t('common.volume', { volume: volumeDisplay })"
    class="flex items-center gap-1 self-stretch rounded bg-neutral-100 dark:bg-neutral-800 px-2 h-full focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 cursor-pointer transition-all"
  >
    <div class="flex items-center gap-2 min-w-28 flex-1">
      <UIcon
        name="i-heroicons-speaker-wave"
        class="w-4 h-4 text-neutral-600 dark:text-neutral-400 shrink-0"
      />
      <USlider
        :model-value="volume ?? 0"
        :min="0"
        :max="100"
        :step="1"
        size="sm"
        class="flex-1"
        :disabled="!selectedDeviceId"
        @update:model-value="handleVolumeChange"
      />
    </div>
    <UFieldGroup size="xs" orientation="horizontal">
      <UButton
        icon="i-heroicons-minus"
        variant="ghost"
        size="xs"
        :disabled="!selectedDeviceId"
        @click="handleDecrease"
      />
      <UButton
        icon="i-heroicons-plus"
        variant="ghost"
        size="xs"
        :disabled="!selectedDeviceId"
        @click="handleIncrease"
      />
    </UFieldGroup>
    <span class="text-xs shrink-0 font-mono w-8 text-right">
      {{ volumeDisplay }}%
    </span>
  </div>
</template>
