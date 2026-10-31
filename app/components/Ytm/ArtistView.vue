<script lang="ts" setup>
import type { YtmArtistAlbum, YtmArtistDetail, YtmVideo } from '~/composables/useYoutubeMusic';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import useAppBackground from '~/composables/useAppBackground';
import useDevices from '~/composables/useDevices';
import usePlayer from '~/composables/usePlayer';
import useYoutubeMusic from '~/composables/useYoutubeMusic';
import { ytmTopSongToQueueTrack, ytmVideoToQueueTrack } from '~/utils/queueTracks';

interface Props {
  artistId: string
}

const props = defineProps<Props>();
const { t } = useI18n();
const ytm = useYoutubeMusic();
const player = usePlayer();
const { selectedDeviceId } = useDevices();
const { setPageBackground, clearPageBackground } = useAppBackground();

const loading = ref(false);
const playing = ref(false);
const loadingAllVideos = ref(false);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const artist = ref<YtmArtistDetail | null>(null);
const showDescriptionModal = ref(false);
const showAllVideosModal = ref(false);
const allVideos = ref<YtmVideo[]>([]);

const description = computed(() => artist.value?.description?.trim() || null);
const showReadMore = computed(() => (description.value?.length || 0) > 220);

const albumGroups = computed(() => {
  if (!artist.value) return [];
  const groups: { key: string, title: string, albums: YtmArtistAlbum[] }[] = [];
  if (artist.value.albums.length) {
    groups.push({ key: 'albums', title: t('artist.albums'), albums: artist.value.albums });
  }
  if (artist.value.singles.length) {
    groups.push({ key: 'singles', title: t('artist.singles'), albums: artist.value.singles });
  }
  return groups;
});

const videoSections = computed(() => {
  if (!artist.value) return [];
  const sections: { key: string, title: string, items: YtmVideo[], canSeeAll: boolean }[] = [];
  if (artist.value.videos.length) {
    sections.push({
      key: 'videos',
      title: t('ytm.artist.videos'),
      items: artist.value.videos,
      canSeeAll: !!artist.value.videosPlaylistId,
    });
  }
  for (const [index, section] of (artist.value.extraVideoSections || []).entries()) {
    sections.push({
      key: `extra-${index}`,
      title: section.title,
      items: section.items,
      canSeeAll: false,
    });
  }
  return sections;
});

const currentPlayingVideoId = computed(() => {
  const uri = player.currentItem.value?.track.uri;
  if (!uri?.startsWith('ytm:track:')) return null;
  return uri.slice('ytm:track:'.length);
});

async function loadArtist() {
  loading.value = true;
  error.value = null;
  artist.value = null;
  allVideos.value = [];
  showAllVideosModal.value = false;
  try {
    artist.value = await ytm.getArtist(props.artistId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('ytm.artist.notFoundDescription');
  } finally {
    loading.value = false;
  }
}

async function playTopSong(index: number) {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  const tracks = (artist.value?.topSongs || [])
    .map((song) => ytmTopSongToQueueTrack(song))
    .filter((track): track is NonNullable<typeof track> => track != null);
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

async function playVideos(items: YtmVideo[], index: number) {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  const tracks = items
    .map((video) => ytmVideoToQueueTrack(video))
    .filter((track): track is NonNullable<typeof track> => track != null);
  if (!tracks.length) return;
  playing.value = true;
  actionError.value = null;
  try {
    await player.playTracks(tracks, index);
    showAllVideosModal.value = false;
    await navigateTo('/');
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('album.playbackError');
  } finally {
    playing.value = false;
  }
}

async function openAllVideos() {
  const playlistId = artist.value?.videosPlaylistId;
  if (!playlistId) return;
  showAllVideosModal.value = true;
  if (allVideos.value.length) return;
  loadingAllVideos.value = true;
  actionError.value = null;
  try {
    allVideos.value = await ytm.getPlaylistVideos(playlistId);
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('album.playbackError');
    showAllVideosModal.value = false;
  } finally {
    loadingAllVideos.value = false;
  }
}

onMounted(() => loadArtist());
watch(() => props.artistId, () => loadArtist());
watch(
  () => artist.value?.thumbnailUrl,
  (picture) => setPageBackground(picture || null),
  { immediate: true },
);
onUnmounted(() => clearPageBackground());
</script>

<template>
  <div class="space-y-6">
    <UiSkeletonArtistView v-if="loading" />
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      :title="error"
      icon="i-heroicons-exclamation-triangle"
    />
    <UEmpty
      v-else-if="!artist"
      icon="i-heroicons-user"
      :title="t('ytm.artist.notFound')"
      :description="t('ytm.artist.notFoundDescription')"
    />
    <div v-else class="flex flex-col gap-6">
      <UCard>
        <div class="flex flex-col md:flex-row gap-6">
          <UiClickableImage
            :src="artist.thumbnailUrl || undefined"
            :alt="artist.name"
            :title="artist.name"
            shape="rounded"
            placeholder-icon="i-heroicons-user"
            use-fade-image
            class="w-44 h-44 md:w-56 md:h-56 shrink-0"
          />
          <div class="flex flex-col justify-end flex-1 min-w-0 w-full gap-3">
            <h1 class="text-3xl md:text-4xl xl:text-5xl font-bold leading-tight">
              {{ artist.name }}
            </h1>
            <div v-if="description" class="min-w-0 space-y-1">
              <p class="text-sm text-muted leading-relaxed line-clamp-3 whitespace-pre-line">
                {{ description }}
              </p>
              <UButton
                v-if="showReadMore"
                variant="link"
                color="neutral"
                size="sm"
                class="px-0"
                :label="t('artist.readMore')"
                @click="showDescriptionModal = true"
              />
            </div>
            <UAlert
              v-if="actionError"
              color="error"
              variant="soft"
              :title="actionError"
              icon="i-heroicons-exclamation-triangle"
            />
          </div>
        </div>
      </UCard>

      <UCard
        v-if="artist.topSongs.length > 0"
        :ui="{ body: '!p-0' }"
        class="overflow-hidden"
      >
        <template #header>
          <h2 class="text-xl font-semibold">
            {{ t('ytm.artist.topSongs') }}
          </h2>
        </template>
        <div class="flex flex-col divide-y divide-(--ui-border)">
          <button
            v-for="(song, index) in artist.topSongs"
            :key="song.videoId"
            type="button"
            class="flex items-center gap-4 px-4 py-3 text-left hover:bg-accented/40 transition-colors disabled:opacity-50"
            :class="currentPlayingVideoId === song.videoId ? 'bg-primary/5' : ''"
            :disabled="!selectedDeviceId || playing"
            @click="playTopSong(index)"
          >
            <div class="w-10 h-10 shrink-0 rounded overflow-hidden bg-accented/50">
              <img
                v-if="song.thumbnailUrl"
                :src="song.thumbnailUrl"
                :alt="song.title"
                class="w-full h-full object-cover"
              >
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
              >
                <UIcon name="i-heroicons-musical-note" class="w-5 h-5 text-muted" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <span
                class="font-semibold truncate block"
                :class="currentPlayingVideoId === song.videoId ? 'text-primary' : ''"
              >
                {{ song.title }}
              </span>
              <p class="text-sm text-muted truncate">
                {{ song.album?.name || song.artists.map((item) => item.name).filter(Boolean).join(', ') }}
              </p>
            </div>
          </button>
        </div>
      </UCard>

      <UCard
        v-for="section in videoSections"
        :key="section.key"
      >
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xl font-semibold">
              {{ section.title }}
            </h2>
            <UButton
              v-if="section.canSeeAll"
              variant="ghost"
              size="sm"
              :loading="loadingAllVideos"
              :label="t('ytm.artist.seeAll')"
              @click="openAllVideos"
            />
          </div>
        </template>
        <div class="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            v-for="(video, index) in section.items"
            :key="`${section.key}-${video.videoId}`"
            type="button"
            class="flex flex-col gap-2 w-44 shrink-0 text-left rounded-lg p-2 hover:bg-accented/40 transition-colors disabled:opacity-50"
            :class="currentPlayingVideoId === video.videoId ? 'ring-2 ring-primary' : ''"
            :disabled="!selectedDeviceId || playing"
            @click="playVideos(section.items, index)"
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
              <div
                class="font-medium text-sm leading-snug line-clamp-2"
                :class="currentPlayingVideoId === video.videoId ? 'text-primary' : ''"
                :title="video.title"
              >
                {{ video.title }}
              </div>
              <div v-if="video.views" class="text-xs text-muted truncate">
                {{ video.views }}
              </div>
            </div>
          </button>
        </div>
      </UCard>

      <UCard
        v-for="group in albumGroups"
        :key="group.key"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold">
              {{ group.title }}
            </h2>
            <UBadge
              :label="t('artist.releaseCount', group.albums.length)"
              variant="soft"
              size="sm"
            />
          </div>
        </template>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <NuxtLink
            v-for="item in group.albums"
            :key="item.id"
            :to="`/ytm/album/${item.id}`"
            class="flex flex-col gap-2 p-3 rounded-lg hover:bg-accented/40 transition-colors group"
          >
            <div class="relative aspect-square w-full rounded-lg overflow-hidden bg-accented/50">
              <img
                v-if="item.thumbnailUrl"
                :src="item.thumbnailUrl"
                :alt="item.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform"
              >
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
              >
                <UIcon name="i-heroicons-musical-note" class="w-12 h-12 text-neutral-400" />
              </div>
            </div>
            <div class="min-h-0 space-y-1">
              <div class="font-medium text-sm leading-snug truncate" :title="item.title">
                {{ item.title }}
              </div>
              <div v-if="item.year" class="text-xs text-muted">
                {{ item.year }}
              </div>
            </div>
          </NuxtLink>
        </div>
      </UCard>

      <UEmpty
        v-if="!artist.topSongs.length && albumGroups.length === 0 && videoSections.length === 0"
        icon="i-heroicons-musical-note"
        :title="t('artist.noAlbums')"
        :description="t('artist.noAlbumsDescription')"
      />
    </div>

    <UModal v-model:open="showDescriptionModal">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">
              {{ t('artist.biography') }}
            </h3>
          </template>
          <p class="text-sm leading-relaxed whitespace-pre-line">
            {{ description }}
          </p>
        </UCard>
      </template>
    </UModal>

    <UModal v-model:open="showAllVideosModal" class="sm:max-w-3xl">
      <template #content>
        <UCard :ui="{ body: '!p-0' }">
          <template #header>
            <h3 class="text-lg font-semibold">
              {{ t('ytm.artist.allVideos') }}
            </h3>
          </template>
          <div v-if="loadingAllVideos" class="flex items-center justify-center gap-2 py-12 text-muted">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
            <span>{{ t('ytm.artist.loadingVideos') }}</span>
          </div>
          <div
            v-else
            class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto p-4"
          >
            <button
              v-for="(video, index) in allVideos"
              :key="video.videoId"
              type="button"
              class="flex items-start gap-3 text-left rounded-lg p-2 hover:bg-accented/40 transition-colors disabled:opacity-50"
              :disabled="!selectedDeviceId || playing"
              @click="playVideos(allVideos, index)"
            >
              <div class="aspect-video w-28 shrink-0 rounded-md overflow-hidden bg-accented/50">
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
                  <UIcon name="i-heroicons-film" class="w-6 h-6 text-muted" />
                </div>
              </div>
              <div class="min-w-0">
                <div class="font-medium text-sm leading-snug line-clamp-2">
                  {{ video.title }}
                </div>
                <div v-if="video.views" class="text-xs text-muted mt-1">
                  {{ video.views }}
                </div>
              </div>
            </button>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
