<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';
import { computed } from 'vue';
import useBottomBar from '~/composables/useBottomBar';
import { useGlobalImageFullscreen } from '~/composables/useImageFullscreen';
import useProviderNavigation from '~/composables/useProviderNavigation';

interface Props {
  coverUrl?: string
  alt?: string
  woodTexture?: string
  title?: string
  titleLink?: RouteLocationRaw
}

const props = withDefaults(defineProps<Props>(), {
  coverUrl: '',
  alt: 'Album cover',
  woodTexture: '/textures/wood-red-cedar.jpg',
  title: '',
});

const { t } = useI18n();

const { currentTrack } = useBottomBar();
const { artistRoute } = useProviderNavigation();
const { open: openFullscreen } = useGlobalImageFullscreen();
const rawArtistName = computed(() => currentTrack.value?.artist || '');
const artistName = computed(() => {
  const name = rawArtistName.value;
  if (!name || name === t('artist.unknown')) return '';
  return name;
});
const artistPicture = computed(() => currentTrack.value?.artistPicture || null);
const hasValidArtist = computed(() => !!artistName.value);
function handleArtistClick() {
  if (artistPicture.value) {
    openFullscreen(artistPicture.value, artistName.value, artistName.value);
  }
}
</script>

<template>
  <div class="flex flex-col items-center w-full mx-auto">
    <div class="relative w-[70%]">
      <div
        class="backboard absolute left-1/2 -translate-x-1/2 w-[60%] bg-cover bg-center rounded-t-lg"
        :style="{ backgroundImage: `url('${props.woodTexture}')` }"
      />
      <div
        v-if="hasValidArtist"
        class="relative z-30 flex flex-col justify-center items-center gap-1 -mt-8 mb-2"
      >
        <UiClickableImage
          v-if="artistPicture"
          :src="artistPicture"
          :alt="artistName"
          :title="artistName"
          shape="rounded"
          placeholder-icon="i-heroicons-user-circle"
          use-fade-image
          class="w-24 h-24"
          @click="handleArtistClick"
        />
        <p
          class="text-center text-sm md:text-base font-medium text-white/90"
          style="text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);"
        >
          <NuxtLink
            v-if="artistRoute"
            :to="artistRoute"
            class="hover:underline"
          >
            {{ artistName }}
          </NuxtLink>
          <span v-else>{{ artistName }}</span>
        </p>
      </div>
    </div>
    <UiClickableImage
      :src="coverUrl"
      :alt="alt"
      :title="title"
      shape="rounded"
      placeholder-icon="i-heroicons-musical-note"
      use-fade-image
      class="w-full aspect-square z-20"
    />
    <div class="relative w-[120%] h-14 -mt-1 z-10">
      <div
        class="stand-wood absolute inset-0 bg-cover bg-center rounded-t rounded-b-lg flex items-center justify-center pt-2"
        :style="{ backgroundImage: `url('${props.woodTexture}')` }"
      >
        <p
          v-if="title"
          class="relative z-5 text-sm md:text-lg font-semibold text-white/95 text-center px-3 truncate max-w-full"
          style="text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);"
        >
          <NuxtLink
            v-if="titleLink"
            :to="titleLink"
            class="hover:underline"
          >
            {{ title }}
          </NuxtLink>
          <span v-else>{{ title }}</span>
        </p>
      </div>
      <div class="stand-lip absolute top-0 left-[7%] right-[7%] h-3 rounded-b z-11" />
    </div>
  </div>
</template>

<style scoped>
.backboard {
  height: calc(100% + 3.5rem);
  bottom: -0.25rem;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 2px 0 4px rgba(255, 255, 255, 0.1),
    inset -2px 0 4px rgba(0, 0, 0, 0.2);
}
.backboard::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.15) 0%,
    transparent 20%,
    transparent 80%,
    rgba(0, 0, 0, 0.15) 100%
  );
  border-radius: inherit;
  pointer-events: none;
}
.stand-wood {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.25),
    inset 0 2px 4px rgba(255, 255, 255, 0.1),
    inset 0 -2px 4px rgba(0, 0, 0, 0.2);
}
.stand-wood::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.08) 0%,
    transparent 30%,
    rgba(0, 0, 0, 0.1) 100%
  );
  border-radius: inherit;
  pointer-events: none;
}
.stand-lip {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.8) 100%);
  backdrop-filter: blur(2px);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
}
</style>
