<script setup lang="ts">
interface Props {
  progress: number
  disabled?: boolean
}
interface Emits {
  (e: 'update:progress', value: number): void
}
withDefaults(defineProps<Props>(), {
  disabled: false,
});
const emit = defineEmits<Emits>();
const handleChange = (value: number) => {
  emit('update:progress', value);
};
</script>

<template>
  <div class="px-4 pt-2">
    <USlider
      :model-value="progress"
      :min="0"
      :max="100"
      :step="0.1"
      :disabled="disabled"
      size="xs"
      class="cursor-pointer"
      @update:model-value="handleChange"
    />
  </div>
</template>
