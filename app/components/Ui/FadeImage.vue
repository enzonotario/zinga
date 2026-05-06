<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

interface Props {
  src?: string | null
  alt?: string
  mode?: 'img' | 'background'
  imageClass?: string
  backgroundStyle?: Record<string, string>
  duration?: number
}
const props = withDefaults(defineProps<Props>(), {
  src: null,
  alt: '',
  mode: 'img',
  imageClass: '',
  backgroundStyle: () => ({}),
  duration: 500,
});
const displayedSrc = ref<string | null>(props.src || null);
const incomingSrc = ref<string | null>(null);
const incomingOpacity = ref(0);
let transitionId = 0;
function preloadImage(url: string, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const timeout = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      finish(false);
    }, timeoutMs);
    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(ok);
    }
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}
async function preloadImageWithRetry(url: string): Promise<boolean> {
  if (await preloadImage(url)) return true;
  await new Promise((r) => setTimeout(r, 600));
  return preloadImage(url);
}
watch(
  () => props.src,
  async (newSrc, _oldSrc) => {
    if (newSrc === displayedSrc.value) return;
    const currentTransitionId = ++transitionId;
    if (!newSrc) {
      displayedSrc.value = null;
      incomingSrc.value = null;
      incomingOpacity.value = 0;
      return;
    }
    if (!displayedSrc.value) {
      const ok = await preloadImageWithRetry(newSrc);
      if (transitionId !== currentTransitionId) return;
      if (ok) displayedSrc.value = newSrc;
      return;
    }
    const ok = await preloadImageWithRetry(newSrc);
    if (transitionId !== currentTransitionId) return;
    if (!ok) return;
    incomingSrc.value = newSrc;
    incomingOpacity.value = 0;
    requestAnimationFrame(() => {
      if (transitionId !== currentTransitionId) return;
      incomingOpacity.value = 1;
    });
    setTimeout(() => {
      if (transitionId !== currentTransitionId) return;
      displayedSrc.value = newSrc;
      incomingSrc.value = null;
      incomingOpacity.value = 0;
    }, props.duration + 50);
  },
  { immediate: true },
);
const transitionStyle = computed(() => ({
  transitionDuration: `${props.duration}ms`,
}));
</script>

<template>
  <div class="fade-image-container">
    <template v-if="mode === 'img'">
      <img
        v-if="displayedSrc"
        :src="displayedSrc"
        :alt="alt"
        class="fade-image-layer"
        :class="imageClass"
      >
      <img
        v-if="incomingSrc"
        :src="incomingSrc"
        :alt="alt"
        class="fade-image-layer transition-opacity"
        :class="imageClass"
        :style="{ ...transitionStyle, opacity: incomingOpacity }"
      >
    </template>
    <template v-else>
      <div
        v-if="displayedSrc"
        class="fade-image-layer"
        :class="imageClass"
        :style="{
          ...backgroundStyle,
          backgroundImage: `url(${displayedSrc})`,
        }"
      />
      <div
        v-if="incomingSrc"
        class="fade-image-layer transition-opacity"
        :class="imageClass"
        :style="{
          ...transitionStyle,
          ...backgroundStyle,
          backgroundImage: `url(${incomingSrc})`,
          opacity: incomingOpacity,
        }"
      />
    </template>
    <slot />
  </div>
</template>

<style scoped>
.fade-image-container {
  position: relative;
  width: 100%;
  height: 100%;
}
.fade-image-layer {
  position: absolute;
  inset: 0;
}
img.fade-image-layer {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
div.fade-image-layer {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
</style>
