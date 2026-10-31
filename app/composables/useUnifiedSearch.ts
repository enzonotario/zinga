import type { YtmSearchResults } from '~/composables/useYoutubeMusic';
import type { SearchResults } from '~/providers/types';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref } from 'vue';
import useProvider from '~/composables/useProvider';
import useYoutubeMusic from '~/composables/useYoutubeMusic';
import {
  emptyTidalSearchResults,
  emptyYtmSearchResults,
  hasUnifiedResults,
} from '~/utils/unifiedSearch';

export interface UseUnifiedSearchOptions {
  tidalLimit?: number
  debounceMs?: number
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default function useUnifiedSearch(options: UseUnifiedSearchOptions = {}) {
  const provider = useProvider();
  const ytm = useYoutubeMusic();
  const tidalLimit = options.tidalLimit ?? 5;
  const debounceMs = options.debounceMs ?? 300;

  const query = ref('');
  const tidalLoading = ref(false);
  const ytmLoading = ref(false);
  const tidalError = ref<string | null>(null);
  const ytmError = ref<string | null>(null);
  const tidalResults = ref<SearchResults>(emptyTidalSearchResults());
  const ytmResults = ref<YtmSearchResults>(emptyYtmSearchResults());

  const loading = computed(() => tidalLoading.value || ytmLoading.value);
  const hasResults = computed(() => hasUnifiedResults(tidalResults.value, ytmResults.value));

  function clearResults() {
    tidalResults.value = emptyTidalSearchResults();
    ytmResults.value = emptyYtmSearchResults();
    tidalError.value = null;
    ytmError.value = null;
  }

  async function searchTidal(searchQuery: string, limit = tidalLimit) {
    tidalLoading.value = true;
    tidalError.value = null;
    try {
      tidalResults.value = await provider.searchAll(searchQuery, limit);
    } catch (err) {
      tidalResults.value = emptyTidalSearchResults();
      tidalError.value = errorText(err);
    } finally {
      tidalLoading.value = false;
    }
  }

  async function searchYtm(searchQuery: string) {
    ytmLoading.value = true;
    ytmError.value = null;
    try {
      ytmResults.value = await ytm.search(searchQuery);
    } catch (err) {
      ytmResults.value = emptyYtmSearchResults();
      ytmError.value = errorText(err);
    } finally {
      ytmLoading.value = false;
    }
  }

  async function searchNow(searchQuery: string, limit = tidalLimit) {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      clearResults();
      return;
    }
    await Promise.all([searchTidal(trimmed, limit), searchYtm(trimmed)]);
  }

  const performSearch = useDebounceFn((searchQuery: string, limit = tidalLimit) => {
    return searchNow(searchQuery, limit);
  }, debounceMs);

  return {
    query,
    tidalResults,
    ytmResults,
    tidalLoading,
    ytmLoading,
    tidalError,
    ytmError,
    loading,
    hasResults,
    clearResults,
    searchNow,
    performSearch,
    searchTidal,
    searchYtm,
  };
}
