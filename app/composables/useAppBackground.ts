import { computed, ref } from 'vue';

const pageBackground = ref<string | null>(null);
const playbackBackground = ref<string | null>(null);
export default function useAppBackground() {
  function setPageBackground(url: string | null) {
    pageBackground.value = url;
  }
  function setPlaybackBackground(url: string | null) {
    playbackBackground.value = url;
  }
  function clearPageBackground() {
    pageBackground.value = null;
  }
  const currentBackground = computed(() => pageBackground.value || playbackBackground.value);
  return {
    pageBackground,
    playbackBackground,
    currentBackground,
    setPageBackground,
    setPlaybackBackground,
    clearPageBackground,
  };
}
