import { ref } from 'vue';
import { lrcToPlainText } from '~/utils/lrc';

interface LyricsPayload {
  lyrics: string | null
  syncedLyrics: string | null
  provider: string
}

const lyrics = ref<string | null>(null);
const syncedLyrics = ref<string | null>(null);
const provider = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const lyricsCache = new Map<string, LyricsPayload | null>();
let activeController: AbortController | null = null;

function buildCacheKey(trackName: string, artistName: string) {
  return `${artistName.trim().toLowerCase()}::${trackName.trim().toLowerCase()}`;
}

export default function useLyrics() {
  const { t } = useI18n();
  async function fetchLyrics(trackName: string, artistName: string) {
    const normalizedTrack = trackName.trim();
    const normalizedArtist = artistName.trim();
    if (!normalizedTrack || !normalizedArtist) {
      clearLyrics();
      return;
    }

    const cacheKey = buildCacheKey(normalizedTrack, normalizedArtist);
    if (lyricsCache.has(cacheKey)) {
      const cached = lyricsCache.get(cacheKey);
      lyrics.value = cached?.lyrics ?? null;
      syncedLyrics.value = cached?.syncedLyrics ?? null;
      provider.value = cached?.provider ?? null;
      error.value = cached ? null : t('lyrics.notFound');
      loading.value = false;
      return;
    }

    if (activeController) {
      activeController.abort();
    }
    activeController = new AbortController();

    loading.value = true;
    error.value = null;
    lyrics.value = null;
    syncedLyrics.value = null;
    provider.value = null;

    try {
      const params = new URLSearchParams({
        track_name: normalizedTrack,
        artist_name: normalizedArtist,
      });
      const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
        signal: activeController.signal,
      });

      if (response.status === 404) {
        lyricsCache.set(cacheKey, null);
        error.value = t('lyrics.notFound');
        return;
      }
      if (!response.ok) {
        throw new Error(t('lyrics.serviceError', { status: response.status }));
      }

      const data = await response.json() as { plainLyrics?: string, syncedLyrics?: string };
      const plain = data.plainLyrics?.trim() || null;
      const synced = data.syncedLyrics?.trim() || null;

      if (!plain && !synced) {
        lyricsCache.set(cacheKey, null);
        error.value = t('lyrics.notFound');
        return;
      }

      const lyricsForPlain = plain || (synced ? lrcToPlainText(synced) : null);
      lyrics.value = lyricsForPlain;
      syncedLyrics.value = synced;
      provider.value = 'LRCLIB';
      lyricsCache.set(cacheKey, {
        lyrics: lyricsForPlain,
        syncedLyrics: synced,
        provider: 'LRCLIB',
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      error.value = t('lyrics.fetchError');
    } finally {
      loading.value = false;
    }
  }

  function clearLyrics() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    lyrics.value = null;
    syncedLyrics.value = null;
    provider.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    lyrics,
    syncedLyrics,
    provider,
    loading,
    error,
    fetchLyrics,
    clearLyrics,
  };
}
