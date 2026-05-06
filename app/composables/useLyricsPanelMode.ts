import { ref, watch } from 'vue';

export type LyricsPanelMode = 'fullscreen' | 'floating' | 'docked';

const STORAGE_KEY = 'zinga.lyricsPanelMode';

function parseStoredMode(raw: string | null): LyricsPanelMode | null {
  if (raw === 'fullscreen' || raw === 'floating' || raw === 'docked') return raw;
  return null;
}

export default function useLyricsPanelMode() {
  const lyricsPanelMode = ref<LyricsPanelMode>('floating');

  if (import.meta.client) {
    try {
      const stored = parseStoredMode(localStorage.getItem(STORAGE_KEY));
      if (stored) lyricsPanelMode.value = stored;
    } catch {

    }
  }

  watch(lyricsPanelMode, (mode) => {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {

    }
  });

  return { lyricsPanelMode };
}
