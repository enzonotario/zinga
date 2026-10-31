<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import usePlayer from '~/composables/usePlayer';
import useUnifiedSearch from '~/composables/useUnifiedSearch';
import { ytmSearchTrackToQueueTrack, ytmVideoToQueueTrack } from '~/utils/queueTracks';

const emit = defineEmits<{ close: [boolean] }>();
const { t } = useI18n();
const player = usePlayer();
const open = ref(false);
const {
  query,
  tidalResults,
  ytmResults,
  loading,
  clearResults,
  performSearch,
} = useUnifiedSearch({ tidalLimit: 5 });

function leading(src: string | undefined, alt: string, icon: string, square = false) {
  if (!src) return { icon };
  return {
    avatar: { src, alt },
    ui: square ? { itemLeadingAvatar: 'rounded-sm' } : undefined,
  };
}

function leadingVideo(src: string | undefined, alt: string) {
  if (!src) return { icon: 'i-heroicons-film' };
  return {
    avatar: { src, alt },
    ui: { itemLeadingAvatar: 'rounded-sm aspect-video h-8 w-auto' },
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

async function playYtmVideo(videoId: string) {
  const video = ytmResults.value.videos.find((item) => item.videoId === videoId);
  if (!video) return;
  const queueTrack = ytmVideoToQueueTrack(video);
  if (!queueTrack) return;
  open.value = false;
  await player.playTracks([queueTrack]);
}

async function openAllResults() {
  const q = query.value.trim();
  if (q.length < 2) return;
  open.value = false;
  await navigateTo({ path: '/search', query: { q } });
}

defineShortcuts({
  meta_k: () => {
    open.value = !open.value;
  },
});

watch(query, (newQuery) => {
  void performSearch(newQuery);
});

const groups = computed(() => {
  const commandGroups: any[] = [];
  const trimmed = query.value.trim();
  if (trimmed.length >= 2) {
    commandGroups.push({
      id: 'see-all',
      ignoreFilter: true,
      items: [{
        id: 'see-all-results',
        label: t('search.seeAllResults', { query: trimmed }),
        icon: 'i-heroicons-arrow-top-right-on-square',
        onSelect: () => {
          void openAllResults();
        },
      }],
    });
  }
  if (tidalResults.value.artists.length > 0) {
    commandGroups.push({
      id: 'artists',
      ignoreFilter: true,
      label: t('search.artists'),
      items: tidalResults.value.artists.map((artist) => ({
        id: `artist-${artist.id}`,
        label: artist.name,
        ...leading(artist.picture, artist.name, 'i-heroicons-user'),
        to: `/artist/${artist.id}`,
      })),
    });
  }
  if (tidalResults.value.albums.length > 0) {
    commandGroups.push({
      id: 'albums',
      ignoreFilter: true,
      label: t('search.albums'),
      items: tidalResults.value.albums.map((album) => ({
        id: `album-${album.id}`,
        label: album.title,
        ...leading(album.coverUrl, album.title, 'i-heroicons-musical-note', true),
        to: `/album/${album.id}`,
      })),
    });
  }
  if (tidalResults.value.tracks.length > 0) {
    commandGroups.push({
      id: 'tracks',
      ignoreFilter: true,
      label: t('search.tracks'),
      items: tidalResults.value.tracks.map((track) => ({
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
      ignoreFilter: true,
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
  if (ytmResults.value.videos.length > 0) {
    commandGroups.push({
      id: 'ytm-videos',
      ignoreFilter: true,
      label: t('search.ytmVideos'),
      items: ytmResults.value.videos.map((video) => ({
        id: `ytm-video-${video.videoId}`,
        label: video.title,
        suffix: video.views || video.artists.map((artist) => artist.name).filter(Boolean).join(', ') || undefined,
        ...leadingVideo(video.thumbnailUrl || undefined, video.title),
        onSelect: () => {
          void playYtmVideo(video.videoId);
        },
      })),
    });
  }
  if (ytmResults.value.albums.length > 0) {
    commandGroups.push({
      id: 'ytm-albums',
      ignoreFilter: true,
      label: t('search.ytmAlbums'),
      items: ytmResults.value.albums.map((album) => ({
        id: `ytm-album-${album.id}`,
        label: album.title,
        suffix: album.artists.map((artist) => artist.name).filter(Boolean).join(', ') || undefined,
        ...leading(album.thumbnailUrl || undefined, album.title, 'i-heroicons-musical-note', true),
        to: `/ytm/album/${album.id}`,
      })),
    });
  }
  if (ytmResults.value.artists.length > 0) {
    commandGroups.push({
      id: 'ytm-artists',
      ignoreFilter: true,
      label: t('search.ytmArtists'),
      items: ytmResults.value.artists.map((artist) => ({
        id: `ytm-artist-${artist.id}`,
        label: artist.name,
        ...leading(artist.thumbnailUrl || undefined, artist.name, 'i-heroicons-user'),
        to: `/ytm/artist/${artist.id}`,
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
    clearResults();
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
        :loading="loading"
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
