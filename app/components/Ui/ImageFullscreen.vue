<script lang="ts" setup>
import { useGlobalImageFullscreen } from '~/composables/useImageFullscreen';

const {
  isOpen,
  imageUrl,
  imageAlt,
  imageTitle,
  scale,
  isDragging,
  imageTransform,
  close,
  resetZoom,
  handleWheel,
  handleMouseDown,
  handleDoubleClick,
} = useGlobalImageFullscreen();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden"
        @click.self="scale > 1 ? null : close()"
        @wheel.prevent="handleWheel"
      >
        <button
          class="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10 p-2"
          @click="close"
        >
          <UIcon name="i-heroicons-x-mark" class="w-8 h-8" />
        </button>
        <button
          v-if="scale > 1"
          class="absolute top-4 left-4 text-white/70 hover:text-white transition-colors z-10 p-2 flex items-center gap-2 bg-white/10 rounded-lg"
          @click="resetZoom"
        >
          <UIcon name="i-heroicons-magnifying-glass-minus" class="w-6 h-6" />
          <span class="text-sm">{{ $t('common.reset') }}</span>
        </button>
        <div
          v-if="scale > 1"
          class="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-white/10 px-3 py-1 rounded-full z-10"
        >
          {{ Math.round(scale * 100) }}%
        </div>
        <img
          :src="imageUrl"
          :alt="imageAlt"
          class="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl select-none will-change-transform"
          :class="[
            scale > 1 ? 'cursor-grab' : 'cursor-zoom-in',
            isDragging ? 'cursor-grabbing transition-none' : 'transition-transform duration-150',
          ]"
          :style="{ transform: imageTransform }"
          draggable="false"
          @mousedown="handleMouseDown"
          @dblclick="handleDoubleClick"
        >
        <p
          v-if="imageTitle && scale === 1"
          class="absolute bottom-6 left-0 right-0 text-center text-white text-xl font-semibold drop-shadow-lg"
        >
          {{ imageTitle }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
