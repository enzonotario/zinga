<script lang="ts" setup>
import { useGlobalImageFullscreen } from '~/composables/useImageFullscreen';

interface Props {
  src?: string | null
  alt?: string
  title?: string
  shape?: 'square' | 'rounded' | 'circle'
  placeholderIcon?: string
  class?: string
  showExpandIcon?: boolean
  useFadeImage?: boolean
  fadeDuration?: number
}
const props = withDefaults(defineProps<Props>(), {
  src: null,
  alt: 'Image',
  title: '',
  shape: 'rounded',
  placeholderIcon: 'i-heroicons-photo',
  showExpandIcon: true,
  useFadeImage: false,
  fadeDuration: 400,
});
const { open: openFullscreen } = useGlobalImageFullscreen();
function handleClick() {
  if (props.src) {
    openFullscreen(props.src, props.alt, props.title || props.alt);
  }
}
const shapeClasses = {
  square: 'rounded-none',
  rounded: 'rounded',
  circle: 'rounded-full',
};
</script>

<template>
  <div
    class="relative overflow-hidden shadow-xl bg-neutral-800 transition-opacity group contain-paint"
    :class="[
      shapeClasses[shape],
      src ? 'cursor-pointer hover:opacity-90' : '',
      $props.class,
    ]"
    @click="handleClick"
  >
    <template v-if="useFadeImage">
      <UiFadeImage
        :src="src || ''"
        :alt="alt"
        mode="img"
        :image-class="`${shapeClasses[shape]} transition-transform duration-300 group-hover:scale-105 will-change-transform backface-hidden`"
        :duration="fadeDuration"
      >
        <div v-if="!src" class="absolute inset-0 flex items-center justify-center">
          <UIcon :name="placeholderIcon" class="w-12 h-12 text-neutral-500" />
        </div>
        <div
          v-if="src && showExpandIcon"
          class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center will-change-[background-color]"
        >
          <UIcon
            name="i-heroicons-arrows-pointing-out"
            class="w-8 h-8 text-white opacity-0 group-hover:opacity-80 transition-opacity duration-300 drop-shadow-lg will-change-opacity"
          />
        </div>
      </UiFadeImage>
    </template>
    <template v-else>
      <img
        v-if="src"
        :src="src"
        :alt="alt"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      >
      <div
        v-else
        class="w-full h-full flex items-center justify-center"
      >
        <UIcon :name="placeholderIcon" class="w-16 h-16 text-neutral-400" />
      </div>
      <div
        v-if="src && showExpandIcon"
        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center"
      >
        <UIcon
          name="i-heroicons-arrows-pointing-out"
          class="w-8 h-8 text-white opacity-0 group-hover:opacity-80 transition-opacity duration-300 drop-shadow-lg"
        />
      </div>
    </template>
  </div>
</template>
