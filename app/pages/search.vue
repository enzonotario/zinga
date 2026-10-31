<script lang="ts" setup>
import type { SearchSourceFilter } from '~/utils/unifiedSearch';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { NO_NAV_CATEGORY } from '~/composables/pages';
import useDevices from '~/composables/useDevices';
import usePlayer from '~/composables/usePlayer';
import useUnifiedSearch from '~/composables/useUnifiedSearch';
import { toQueueTrack, ytmSearchTrackToQueueTrack, ytmVideoToQueueTrack } from '~/utils/queueTracks';
import { formatTime } from '~/utils/time';
import {
  hasUnifiedResults,
  showTidalResults,
  showYtmResults,
} from '~/utils/unifiedSearch';

definePageMeta({
  layout: 'default',
  category: NO_NAV_CATEGORY,
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const player = usePlayer();
const { selectedDeviceId } = useDevices();
const {
  query,
  tidalResults,
  ytmResults,
  tidalLoading,
  ytmLoading,
  tidalError,
  ytmError,
  loading,
  searchNow,
  performSearch,
} = useUnifiedSearch({ tidalLimit: 25, debounceMs: 300 });

const source = ref<SearchSourceFilter>('all');
const playing = ref(false);
const actionError = ref<string | null>(null);

const sourceItems = computed(() => [
  { label: t('search.sourceAll'), value: 'all' },
  { label: t('search.sourceTidal'), value: 'tidal' },
  { label: t('search.sourceYtm'), value: 'ytm' },
]);

const showTidal = computed(() => showTidalResults(source.value));
const showYtm = computed(() => showYtmResults(source.value));
const showBadges = computed(() => source.value === 'all');
const hasResults = computed(() =>
  hasUnifiedResults(tidalResults.value, ytmResults.value, source.value),
);
const queryReady = computed(() => query.value.trim().length >= 2);
const showEmpty = computed(() =>
  queryReady.value && !loading.value && !tidalError.value && !ytmError.value && !hasResults.value,
);

const hasArtistItems = computed(() =>
  (showTidal.value && tidalResults.value.artists.length > 0)
  || (showYtm.value && ytmResults.value.artists.length > 0),
);
const hasAlbumItems = computed(() =>
  (showTidal.value && tidalResults.value.albums.length > 0)
  || (showYtm.value && ytmResults.value.albums.length > 0),
);
const hasTrackItems = computed(() =>
  (showTidal.value && tidalResults.value.tracks.length > 0)
  || (showYtm.value && ytmResults.value.tracks.length > 0),
);
const hasVideoItems = computed(() => showYtm.value && ytmResults.value.videos.length > 0);

const artistsLoading = computed(() =>
  (showTidal.value && tidalLoading.value) || (showYtm.value && ytmLoading.value),
);
const albumsLoading = computed(() =>
  (showTidal.value && tidalLoading.value) || (showYtm.value && ytmLoading.value),
);
const tracksLoading = computed(() =>
  (showTidal.value && tidalLoading.value) || (showYtm.value && ytmLoading.value),
);

const showArtistsSection = computed(() => artistsLoading.value || hasArtistItems.value);
const showAlbumsSection = computed(() => albumsLoading.value || hasAlbumItems.value);
const showTracksSection = computed(() => tracksLoading.value || hasTrackItems.value);
const showVideosSection = computed(() =>
  showYtm.value && (ytmLoading.value || hasVideoItems.value),
);

const syncUrl = useDebounceFn((value: string) => {
  const q = value.trim();
  const current = typeof route.query.q === 'string' ? route.query.q : '';
  if (q === current) return;
  void router.replace({ path: '/search', query: q ? { q } : {} });
}, 200);

function artistsLabel(artists: { name: string }[] | undefined) {
  return (artists || []).map((artist) => artist.name).filter(Boolean).join(', ');
}

function yearFromDate(date?: string | null) {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

async function playQueueTracks(tracks: ReturnType<typeof toQueueTrack>[], index = 0) {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  if (!tracks.length) return;
  playing.value = true;
  actionError.value = null;
  try {
    await player.playTracks(tracks, index);
    await navigateTo('/');
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('album.playbackError');
  } finally {
    playing.value = false;
  }
}

async function playTidalTrack(trackId: string) {
  const index = tidalResults.value.tracks.findIndex((track) => track.id === trackId);
  if (index < 0) return;
  const tracks = tidalResults.value.tracks.map((track) => toQueueTrack(track));
  await playQueueTracks(tracks, index);
}

function addTidalTrackToQueue(trackId: string) {
  const track = tidalResults.value.tracks.find((item) => item.id === trackId);
  if (!track) return;
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  actionError.value = null;
  player.addTracks([toQueueTrack(track)]);
}

async function playYtmTrack(videoId: string) {
  const index = ytmResults.value.tracks.findIndex((track) => track.videoId === videoId);
  if (index < 0) return;
  const tracks = ytmResults.value.tracks
    .map((track) => ytmSearchTrackToQueueTrack(track))
    .filter((track): track is NonNullable<typeof track> => track != null);
  const start = tracks.findIndex((track) => track.uri === `ytm:track:${videoId}`);
  await playQueueTracks(tracks, start >= 0 ? start : 0);
}

function addYtmTrackToQueue(videoId: string) {
  const track = ytmResults.value.tracks.find((item) => item.videoId === videoId);
  if (!track) return;
  const queueTrack = ytmSearchTrackToQueueTrack(track);
  if (!queueTrack) return;
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  actionError.value = null;
  player.addTracks([queueTrack]);
}

async function playYtmVideo(videoId: string) {
  const index = ytmResults.value.videos.findIndex((video) => video.videoId === videoId);
  if (index < 0) return;
  const tracks = ytmResults.value.videos
    .map((video) => ytmVideoToQueueTrack(video))
    .filter((track): track is NonNullable<typeof track> => track != null);
  const start = tracks.findIndex((track) => track.uri === `ytm:track:${videoId}`);
  await playQueueTracks(tracks, start >= 0 ? start : 0);
}

query.value = typeof route.query.q === 'string' ? route.query.q : '';
void searchNow(query.value, 25);

watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : '';
    if (query.value === next) return;
    query.value = next;
  },
);

watch(query, (value) => {
  syncUrl(value);
  void performSearch(value, 25);
});
</script>

<template>
  <div class="py-6 space-y-6">
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
        {{ t('search.pageTitle') }}
      </h1>
      <UInput
        v-model="query"
        icon="i-heroicons-magnifying-glass"
        size="lg"
        :placeholder="t('search.placeholder')"
        autofocus
        class="max-w-xl"
      />
      <UTabs
        v-model="source"
        :items="sourceItems"
        :content="false"
        class="w-full max-w-md"
      />
    </div>

    <UAlert
      v-if="actionError"
      color="error"
      variant="soft"
      :title="actionError"
      icon="i-heroicons-exclamation-triangle"
    />
    <UAlert
      v-if="showTidal && tidalError"
      color="error"
      variant="soft"
      :title="t('search.tidalError')"
      :description="tidalError"
      icon="i-heroicons-exclamation-triangle"
    />
    <UAlert
      v-if="showYtm && ytmError"
      color="error"
      variant="soft"
      :title="t('search.ytmError')"
      :description="ytmError"
      icon="i-heroicons-exclamation-triangle"
    />

    <p
      v-if="!queryReady"
      class="text-sm text-muted"
    >
      {{ t('search.minChars') }}
    </p>

    <template v-else>
      <div
        v-if="loading && !hasResults"
        class="space-y-6"
      >
        <UCard>
          <template #header>
            <USkeleton class="h-6 w-32" />
          </template>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div
              v-for="i in 6"
              :key="`artist-skel-${i}`"
              class="flex flex-col items-center gap-2"
            >
              <USkeleton class="w-24 h-24 rounded-full" />
              <USkeleton class="h-4 w-20" />
            </div>
          </div>
        </UCard>
        <UCard>
          <template #header>
            <USkeleton class="h-6 w-28" />
          </template>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div
              v-for="i in 6"
              :key="`album-skel-${i}`"
              class="space-y-2"
            >
              <USkeleton class="aspect-square w-full rounded-lg" />
              <USkeleton class="h-4 w-full" />
              <USkeleton class="h-3 w-2/3" />
            </div>
          </div>
        </UCard>
      </div>

      <UEmpty
        v-else-if="showEmpty"
        icon="i-heroicons-magnifying-glass"
        :title="t('search.noResults')"
        :description="t('search.noResultsDescription', { query: query.trim() })"
      />

      <div
        v-else
        class="space-y-6"
      >
        <UCard
          v-if="showArtistsSection"
        >
          <template #header>
            <h2 class="text-xl font-semibold">
              {{ t('search.artists') }}
            </h2>
          </template>
          <div
            v-if="artistsLoading && !hasArtistItems"
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            <div
              v-for="i in 6"
              :key="`artist-skel-${i}`"
              class="flex flex-col items-center gap-2"
            >
              <USkeleton class="w-24 h-24 rounded-full" />
              <USkeleton class="h-4 w-20" />
            </div>
          </div>
          <div
            v-else
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            <NuxtLink
              v-for="artist in tidalResults.artists"
              v-show="showTidal"
              :key="`tidal-artist-${artist.id}`"
              :to="`/artist/${artist.id}`"
              class="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-accented/40 transition-colors"
            >
              <div class="w-24 h-24 rounded-full overflow-hidden bg-accented/50">
                <img
                  v-if="artist.picture"
                  :src="artist.picture"
                  :alt="artist.name"
                  class="w-full h-full object-cover"
                >
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-user" class="w-10 h-10 text-muted" />
                </div>
              </div>
              <span class="text-sm font-medium text-center line-clamp-2">
                {{ artist.name }}
              </span>
              <UBadge
                v-if="showBadges"
                :label="t('search.sourceTidal')"
                variant="subtle"
                size="sm"
              />
            </NuxtLink>
            <NuxtLink
              v-for="artist in ytmResults.artists"
              v-show="showYtm"
              :key="`ytm-artist-${artist.id}`"
              :to="`/ytm/artist/${artist.id}`"
              class="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-accented/40 transition-colors"
            >
              <div class="w-24 h-24 rounded-full overflow-hidden bg-accented/50">
                <img
                  v-if="artist.thumbnailUrl"
                  :src="artist.thumbnailUrl"
                  :alt="artist.name"
                  class="w-full h-full object-cover"
                >
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-user" class="w-10 h-10 text-muted" />
                </div>
              </div>
              <span class="text-sm font-medium text-center line-clamp-2">
                {{ artist.name }}
              </span>
              <UBadge
                v-if="showBadges"
                :label="t('search.sourceYtm')"
                variant="subtle"
                size="sm"
              />
            </NuxtLink>
          </div>
        </UCard>

        <UCard
          v-if="showAlbumsSection"
        >
          <template #header>
            <h2 class="text-xl font-semibold">
              {{ t('search.albums') }}
            </h2>
          </template>
          <div
            v-if="albumsLoading && !hasAlbumItems"
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            <div
              v-for="i in 6"
              :key="`album-skel-${i}`"
              class="space-y-2"
            >
              <USkeleton class="aspect-square w-full rounded-lg" />
              <USkeleton class="h-4 w-full" />
            </div>
          </div>
          <div
            v-else
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            <NuxtLink
              v-for="album in tidalResults.albums"
              v-show="showTidal"
              :key="`tidal-album-${album.id}`"
              :to="`/album/${album.id}`"
              class="flex flex-col gap-2 p-2 rounded-lg hover:bg-accented/40 transition-colors"
            >
              <div class="aspect-square w-full rounded-lg overflow-hidden bg-accented/50">
                <img
                  v-if="album.coverUrl"
                  :src="album.coverUrl"
                  :alt="album.title"
                  class="w-full h-full object-cover"
                >
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-musical-note" class="w-10 h-10 text-muted" />
                </div>
              </div>
              <div class="min-w-0 space-y-1">
                <div class="font-medium text-sm truncate" :title="album.title">
                  {{ album.title }}
                </div>
                <div class="text-xs text-muted truncate">
                  {{ artistsLabel(album.artists) }}
                </div>
                <div v-if="yearFromDate(album.releaseDate)" class="text-xs text-muted">
                  {{ yearFromDate(album.releaseDate) }}
                </div>
                <UBadge
                  v-if="showBadges"
                  :label="t('search.sourceTidal')"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </NuxtLink>
            <NuxtLink
              v-for="album in ytmResults.albums"
              v-show="showYtm"
              :key="`ytm-album-${album.id}`"
              :to="`/ytm/album/${album.id}`"
              class="flex flex-col gap-2 p-2 rounded-lg hover:bg-accented/40 transition-colors"
            >
              <div class="aspect-square w-full rounded-lg overflow-hidden bg-accented/50">
                <img
                  v-if="album.thumbnailUrl"
                  :src="album.thumbnailUrl"
                  :alt="album.title"
                  class="w-full h-full object-cover"
                >
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-musical-note" class="w-10 h-10 text-muted" />
                </div>
              </div>
              <div class="min-w-0 space-y-1">
                <div class="font-medium text-sm truncate" :title="album.title">
                  {{ album.title }}
                </div>
                <div class="text-xs text-muted truncate">
                  {{ artistsLabel(album.artists) }}
                </div>
                <div v-if="album.year" class="text-xs text-muted">
                  {{ album.year }}
                </div>
                <UBadge
                  v-if="showBadges"
                  :label="t('search.sourceYtm')"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </NuxtLink>
          </div>
        </UCard>

        <UCard
          v-if="showTracksSection"
          :ui="{ body: hasTrackItems ? '!p-0' : undefined }"
        >
          <template #header>
            <h2 class="text-xl font-semibold">
              {{ t('search.tracks') }}
            </h2>
          </template>
          <div
            v-if="tracksLoading && !hasTrackItems"
            class="space-y-3 p-4"
          >
            <USkeleton
              v-for="i in 5"
              :key="`track-skel-${i}`"
              class="h-12 w-full"
            />
          </div>
          <div
            v-else
            class="flex flex-col divide-y divide-(--ui-border)"
          >
            <div
              v-for="track in tidalResults.tracks"
              v-show="showTidal"
              :key="`tidal-track-${track.id}`"
              class="flex items-center gap-3 px-4 py-3 hover:bg-accented/40 transition-colors"
            >
              <button
                type="button"
                class="flex flex-1 items-center gap-3 min-w-0 text-left disabled:opacity-50"
                :disabled="!selectedDeviceId || playing"
                @click="playTidalTrack(track.id)"
              >
                <div class="w-10 h-10 shrink-0 rounded overflow-hidden bg-accented/50">
                  <img
                    v-if="track.coverUrl"
                    :src="track.coverUrl"
                    :alt="track.title"
                    class="w-full h-full object-cover"
                  >
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center"
                  >
                    <UIcon name="i-heroicons-musical-note" class="w-5 h-5 text-muted" />
                  </div>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="font-medium truncate">
                      {{ track.title }}
                    </div>
                    <UBadge
                      v-if="showBadges"
                      :label="t('search.sourceTidal')"
                      variant="subtle"
                      size="sm"
                      class="shrink-0"
                    />
                  </div>
                  <div class="text-sm text-muted truncate">
                    {{ artistsLabel(track.artists) }}
                  </div>
                </div>
                <div class="text-sm text-muted shrink-0 w-12 text-right">
                  {{ track.duration ? formatTime(track.duration) : '--:--' }}
                </div>
              </button>
              <UButton
                icon="i-heroicons-queue-list"
                variant="ghost"
                size="sm"
                :disabled="!selectedDeviceId"
                :aria-label="t('album.addToQueue')"
                @click="addTidalTrackToQueue(track.id)"
              />
            </div>
            <div
              v-for="track in ytmResults.tracks"
              v-show="showYtm"
              :key="`ytm-track-${track.videoId}`"
              class="flex items-center gap-3 px-4 py-3 hover:bg-accented/40 transition-colors"
            >
              <button
                type="button"
                class="flex flex-1 items-center gap-3 min-w-0 text-left disabled:opacity-50"
                :disabled="!selectedDeviceId || playing"
                @click="playYtmTrack(track.videoId)"
              >
                <div class="w-10 h-10 shrink-0 rounded overflow-hidden bg-accented/50">
                  <img
                    v-if="track.thumbnailUrl"
                    :src="track.thumbnailUrl"
                    :alt="track.title"
                    class="w-full h-full object-cover"
                  >
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center"
                  >
                    <UIcon name="i-heroicons-musical-note" class="w-5 h-5 text-muted" />
                  </div>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="font-medium truncate">
                      {{ track.title }}
                    </div>
                    <UBadge
                      v-if="showBadges"
                      :label="t('search.sourceYtm')"
                      variant="subtle"
                      size="sm"
                      class="shrink-0"
                    />
                  </div>
                  <div class="text-sm text-muted truncate">
                    {{ artistsLabel(track.artists) }}
                    <span v-if="track.album?.name"> · {{ track.album.name }}</span>
                  </div>
                </div>
                <div class="text-sm text-muted shrink-0 w-12 text-right">
                  {{ track.durationSec ? formatTime(track.durationSec) : '--:--' }}
                </div>
              </button>
              <UButton
                icon="i-heroicons-queue-list"
                variant="ghost"
                size="sm"
                :disabled="!selectedDeviceId"
                :aria-label="t('album.addToQueue')"
                @click="addYtmTrackToQueue(track.videoId)"
              />
            </div>
          </div>
        </UCard>

        <UCard
          v-if="showVideosSection"
        >
          <template #header>
            <h2 class="text-xl font-semibold">
              {{ t('search.videos') }}
            </h2>
          </template>
          <div
            v-if="ytmLoading && !ytmResults.videos.length"
            class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            <div
              v-for="i in 4"
              :key="`video-skel-${i}`"
              class="space-y-2"
            >
              <USkeleton class="aspect-video w-full rounded-md" />
              <USkeleton class="h-4 w-full" />
            </div>
          </div>
          <div
            v-else
            class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          >
            <button
              v-for="video in ytmResults.videos"
              :key="`ytm-video-${video.videoId}`"
              type="button"
              class="flex flex-col gap-2 text-left rounded-lg p-2 hover:bg-accented/40 transition-colors disabled:opacity-50"
              :disabled="!selectedDeviceId || playing"
              @click="playYtmVideo(video.videoId)"
            >
              <div class="aspect-video w-full rounded-md overflow-hidden bg-accented/50">
                <img
                  v-if="video.thumbnailUrl"
                  :src="video.thumbnailUrl"
                  :alt="video.title"
                  class="w-full h-full object-cover"
                >
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-film" class="w-8 h-8 text-muted" />
                </div>
              </div>
              <div class="min-w-0 space-y-1">
                <div class="font-medium text-sm line-clamp-2" :title="video.title">
                  {{ video.title }}
                </div>
                <div v-if="video.views" class="text-xs text-muted truncate">
                  {{ video.views }}
                </div>
                <UBadge
                  v-if="showBadges"
                  :label="t('search.sourceYtm')"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </button>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
