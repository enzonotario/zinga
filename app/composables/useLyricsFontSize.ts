import type { Ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

const STORAGE_KEY = 'zinga.lyricsFontPx';
const DEFAULT_PX = 14;
const MIN_PX = 11;
const MAX_PX = 32;

function clampLyricsFontPx(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PX;
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(n)));
}

export default function useLyricsFontSize() {
  const lyricsFontSizePx = ref(DEFAULT_PX);

  if (import.meta.client) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) lyricsFontSizePx.value = clampLyricsFontPx(Number(raw));
    } catch {

    }
  }

  watch(lyricsFontSizePx, (raw) => {
    const v = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
    if (!Number.isFinite(v)) {
      lyricsFontSizePx.value = DEFAULT_PX;
      return;
    }
    const c = clampLyricsFontPx(v);
    if (c !== v) {
      lyricsFontSizePx.value = c;
      return;
    }
    if (!import.meta.client) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(c));
    } catch {

    }
  });

  function bumpLyricsFontSize(delta: number) {
    lyricsFontSizePx.value = clampLyricsFontPx(lyricsFontSizePx.value + delta);
  }

  function applyLyricsFontInput(v: unknown) {
    if (v === '' || v === null || v === undefined) return;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    if (!Number.isFinite(n)) return;
    lyricsFontSizePx.value = n;
  }

  const lyricsBodyStyle = computed(() => ({
    fontSize: `${lyricsFontSizePx.value}px`,
  }));

  function registerLyricsWheelScroll(target: Ref<HTMLElement | null | undefined>) {
    return useEventListener(
      target,
      'wheel',
      (e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        bumpLyricsFontSize(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  return {
    lyricsFontSizePx,
    lyricsFontMinPx: MIN_PX,
    lyricsFontMaxPx: MAX_PX,
    bumpLyricsFontSize,
    applyLyricsFontInput,
    registerLyricsWheelScroll,
    lyricsBodyStyle,
  };
}
