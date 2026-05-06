<script lang="ts" setup>
import { computed, watch } from 'vue';
import useAppBackground from '~/composables/useAppBackground';
import useBottomBar from '~/composables/useBottomBar';
import useMopidy from '~/composables/useMopidy';
import usePlayer from '~/composables/usePlayer';

const { currentTrack } = useBottomBar();
const mopidy = useMopidy();
const player = usePlayer();
const colorMode = useColorMode();
const { currentBackground, setPlaybackBackground } = useAppBackground();
const hasValidPlayback = computed(() =>
  mopidy.tracklist.value?.length || player.isPlaying.value,
);
const logoBackground = computed(() =>
  colorMode.value === 'dark' ? '/assets/logo-white.svg' : '/assets/logo-black.svg',
);
const effectiveBackground = computed(() =>
  currentBackground.value || (!hasValidPlayback.value ? logoBackground.value : null),
);
watch(
  () => currentTrack.value?.coverUrl,
  (coverUrl) => {
    if (hasValidPlayback.value && coverUrl) {
      setPlaybackBackground(coverUrl);
    } else if (!hasValidPlayback.value) {
      setPlaybackBackground(null);
    }
  },
  { immediate: true },
);
const backgroundStyle = {
  filter: 'blur(40px)',
  transform: 'scale(1.1)',
};
</script>

<template>
  <div class="pointer-events-none fixed inset-0 -z-20 bg-default">
    <UiFadeImage
      :src="effectiveBackground"
      mode="background"
      :background-style="backgroundStyle"
      :duration="500"
    />
  </div>
</template>
