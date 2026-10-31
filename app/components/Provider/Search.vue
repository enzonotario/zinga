<script lang="ts" setup>
import type { YtmSearchResults } from '~/composables/useYoutubeMusic';
import type { SearchResults } from '~/providers/types';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import usePlayer from '~/composables/usePlayer';
import useProvider from '~/composables/useProvider';
import useYoutubeMusic from '~/composables/useYoutubeMusic';
import { ytmSearchTrackToQueueTrack } from '~/utils/queueTracks';

const emit = defineEmits<{ close: [boolean] }>();
const { t } = useI18n();
const provider = useProvider();
const player = usePlayer();
const ytm = useYoutubeMusic();
const query = ref('');
const loading = ref(false);
const ytmLoading = ref(false);
const open = ref(false);
const results = ref<SearchResults>({
  artists: [],
  albums: [],
  tracks: [],
});
const ytmResults = ref<YtmSearchResults>({
  tracks: [],
  albums: [],
  artists: [],
});

const emptyYtm = (): YtmSearchResults => ({ tracks: [], albums: [], artists: [] });

async function searchTidal(searchQuery: string) {
  loading.value = true;
  try {
    results.value = await provider.searchAll(searchQuery, 5);
  } catch {
    results.value = { artists: [], albums: [], tracks: [] };
  } finally {
    loading.value = false;
  }
}

async function searchYtm(searchQuery: string) {
  ytmLoading.value = true;
  try {
    ytmResults.value = await ytm.search(searchQuery);
  } catch {
    ytmResults.value = emptyYtm();
  } finally {
    ytmLoading.value = false;
  }
}

const performSearch = useDebounceFn(async (searchQuery: string) => {
  if (!searchQuery.trim() || searchQuery.length < 2) {
    results.value = { artists: [], albums: [], tracks: [] };
    ytmResults.value = emptyYtm();
    return;
  }
  await Promise.all([searchTidal(searchQuery), searchYtm(searchQuery)]);
}, 300);

function leading(src: string | undefined, alt: string, icon: string, square = false) {
  if (!src) return { icon };
  return {
    avatar: { src, alt },
    ui: square ? { itemLeadingAvatar: 'rounded-sm' } : undefined,
  };
}

async function playYtmTrack(videoId: string) {
  const track = ytmResults.value.tracks.find((item) => item.videoId === videoId);
  if (!track) return;
  const queueTrack = ytmSearchTrackToQueueTrack(track);
  if (!queueTrack) return;
  open.value = false;
  await player.playTracks([queueTrack]);
}

defineShortcuts({
  meta_k: () => {
    open.value = !open.value;
  },
});
watch(query, (newQuery) => performSearch(newQuery));
const groups = computed(() => {
  const commandGroups: any[] = [];
  if (results.value.artists.length > 0) {
    commandGroups.push({
      id: 'artists',
      label: t('search.artists'),
      items: results.value.artists.map((artist) => ({
        id: `artist-${artist.id}`,
        label: artist.name,
        ...leading(artist.picture, artist.name, 'i-heroicons-user'),
        to: `/artist/${artist.id}`,
      })),
    });
  }
  if (results.value.albums.length > 0) {
    commandGroups.push({
      id: 'albums',
      label: t('search.albums'),
      items: results.value.albums.map((album) => ({
        id: `album-${album.id}`,
        label: album.title,
        ...leading(album.coverUrl, album.title, 'i-heroicons-musical-note', true),
        to: `/album/${album.id}`,
      })),
    });
  }
  if (results.value.tracks.length > 0) {
    commandGroups.push({
      id: 'tracks',
      label: t('search.tracks'),
      items: results.value.tracks.map((track) => ({
        id: `track-${track.id}`,
        label: track.title,
        ...leading(track.coverUrl, track.title, 'i-heroicons-musical-note', true),
        to: `/track/${track.id}`,
      })),
    });
  }
  if (ytmResults.value.tracks.length > 0) {
    commandGroups.push({
      id: 'ytm-tracks',
      label: t('search.ytmTracks'),
      items: ytmResults.value.tracks.map((track) => ({
        id: `ytm-track-${track.videoId}`,
        label: track.title,
        suffix: track.artists.map((artist) => artist.name).filter(Boolean).join(', ') || undefined,
        ...leading(track.thumbnailUrl || undefined, track.title, 'i-heroicons-musical-note', true),
        onSelect: () => {
          void playYtmTrack(track.videoId);
        },
      })),
    });
  }
  return commandGroups;
});
function onItemSelect(item: any) {
  if (item) open.value = false;
}
watch(open, (isOpen) => {
  if (!isOpen) {
    query.value = '';
    results.value = { artists: [], albums: [], tracks: [] };
    ytmResults.value = emptyYtm();
    emit('close', true);
  }
});
</script>

<template>
  <UModal v-model:open="open" class="sm:max-w-2xl">
    <UButton icon="i-heroicons-magnifying-glass" variant="ghost">
      {{ $t('search.button') }}
      <template #trailing>
        <span class="hidden sm:flex items-center gap-0.5">
          <UKbd value="meta" size="sm" />
          <UKbd value="k" size="sm" />
        </span>
      </template>
    </UButton>
    <template #content>
      <UCommandPalette
        v-model:search-term="query"
        :groups="groups"
        :loading="loading || ytmLoading"
        :placeholder="$t('search.placeholder')"
        :autofocus="true"
        close
        @update:open="(value: boolean) => { if (!value) open = false }"
        @update:model-value="onItemSelect"
      >
        <template #empty>
          <div class="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <UIcon
              name="i-heroicons-magnifying-glass"
              class="w-12 h-12 text-muted"
            />
            <p class="text-sm text-muted">
              {{ query.length < 2 ? $t('search.minChars') : $t('search.noResults') }}
            </p>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
