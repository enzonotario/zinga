<script setup lang="ts">
import { computed, ref } from 'vue';

interface Props {
  progress: number
  disabled?: boolean
}
interface Emits {
  (e: 'update:progress', value: number): void
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});
const emit = defineEmits<Emits>();

const dragValue = ref<number | null>(null);
const sliderValue = computed(() => dragValue.value ?? props.progress);

function handleUpdate(value?: number) {
  if (value == null) return;
  dragValue.value = value;
}

function handleCommit() {
  if (dragValue.value == null) return;
  emit('update:progress', dragValue.value);
  dragValue.value = null;
}
</script>

<template>
  <div class="px-4 pt-2">
    <USlider
      :model-value="sliderValue"
      :min="0"
      :max="100"
      :step="0.1"
      :disabled="disabled"
      size="xs"
      class="cursor-pointer"
      :ui="{
        track: 'bg-gray-400 dark:bg-gray-600',
      }"
      @update:model-value="handleUpdate"
      @change="handleCommit"
    />
  </div>
</template>
