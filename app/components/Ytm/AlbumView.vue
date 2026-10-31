<script lang="ts" setup>
import type { YtmAlbumDetail } from '~/composables/useYoutubeMusic';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import useAppBackground from '~/composables/useAppBackground';
import useDevices from '~/composables/useDevices';
import useItemSelection from '~/composables/useItemSelection';
import usePlayer from '~/composables/usePlayer';
import useYoutubeMusic from '~/composables/useYoutubeMusic';
import { ytmAlbumTrackToQueueTrack } from '~/utils/queueTracks';
import { orderedSelectedItems } from '~/utils/selection';
import { formatTime, formatTimeHHMMSS } from '~/utils/time';

interface Props {
  albumId: string
}

const props = defineProps<Props>();
const { t } = useI18n();
const ytm = useYoutubeMusic();
const player = usePlayer();
const { selectedDeviceId } = useDevices();
const { setPageBackground, clearPageBackground } = useAppBackground();
const {
  selectedIds,
  count: selectionCount,
  clear: clearSelection,
  isSelected,
  handleClick,
} = useItemSelection();

const loading = ref(false);
const playing = ref(false);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const album = ref<YtmAlbumDetail | null>(null);

const queueTracks = computed(() => {
  if (!album.value) return [];
  return album.value.tracks
    .map((track) => ytmAlbumTrackToQueueTrack(track, album.value!))
    .filter((track): track is NonNullable<typeof track> => track != null);
});

const trackIds = computed(() => (album.value?.tracks || []).map((track) => track.videoId));

const totalDurationFormatted = computed(() => {
  const seconds = album.value?.tracks.reduce((sum, track) => sum + (track.durationSec || 0), 0) || 0;
  if (!seconds) return null;
  return seconds >= 3600 ? formatTimeHHMMSS(seconds) : formatTime(seconds);
});

const currentPlayingVideoId = computed(() => {
  const uri = player.currentItem.value?.track.uri;
  if (!uri?.startsWith('ytm:track:')) return null;
  return uri.slice('ytm:track:'.length);
});

function formatTrackDuration(seconds?: number | null) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '--:--';
  return seconds >= 3600 ? formatTimeHHMMSS(seconds) : formatTime(seconds);
}

async function loadAlbum() {
  loading.value = true;
  error.value = null;
  album.value = null;
  try {
    album.value = await ytm.getAlbum(props.albumId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('ytm.album.notFoundDescription');
  } finally {
    loading.value = false;
  }
}

async function playFrom(index = 0) {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  if (queueTracks.value.length === 0) return;
  playing.value = true;
  actionError.value = null;
  try {
    await player.playTracks(queueTracks.value, index);
    clearSelection();
    await navigateTo('/');
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('album.playbackError');
  } finally {
    playing.value = false;
  }
}

async function onTrackClick(event: MouseEvent, index: number) {
  const kind = handleClick(event, 'album-tracks', trackIds.value, index);
  if (kind !== 'play') return;
  await playFrom(index);
}

function selectedQueueTracks() {
  if (!album.value) return [];
  return orderedSelectedItems(album.value.tracks, selectedIds.value, (track) => track.videoId)
    .map((track) => ytmAlbumTrackToQueueTrack(track, album.value!))
    .filter((track): track is NonNullable<typeof track> => track != null);
}

async function playSelection() {
  const tracks = selectedQueueTracks();
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  if (!tracks.length) return;
  playing.value = true;
  actionError.value = null;
  try {
    await player.playTracks(tracks);
    clearSelection();
    await navigateTo('/');
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('album.playbackError');
  } finally {
    playing.value = false;
  }
}

function queueSelection() {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  const tracks = selectedQueueTracks();
  if (!tracks.length) return;
  actionError.value = null;
  player.addTracks(tracks);
  clearSelection();
}

function addToQueue() {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  actionError.value = null;
  player.addTracks(queueTracks.value);
}

onMounted(() => loadAlbum());
watch(() => props.albumId, () => loadAlbum());
watch(
  () => album.value?.thumbnailUrl,
  (cover) => setPageBackground(cover || null),
  { immediate: true },
);
onUnmounted(() => clearPageBackground());
</script>

<template>
  <div class="space-y-6">
    <UiSkeletonAlbumView v-if="loading" />
    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      :title="error"
      icon="i-heroicons-exclamation-triangle"
    />
    <UEmpty
      v-else-if="!album"
      icon="i-heroicons-musical-note"
      :title="t('ytm.album.notFound')"
      :description="t('ytm.album.notFoundDescription')"
    />
    <div v-else class="flex flex-col gap-6">
      <div v-if="album.artists.length > 0" class="flex flex-wrap gap-2">
        <NuxtLink
          v-for="artist in album.artists.filter((item) => item.id)"
          :key="artist.id!"
          :to="`/ytm/artist/${artist.id}`"
          class="inline-flex items-center gap-2 px-3 py-1 rounded-full glass ring ring-default hover:bg-accented/40 transition-colors"
        >
          <span class="text-sm font-medium hover:underline">
            {{ artist.name }}
          </span>
        </NuxtLink>
        <span
          v-if="album.artists.every((item) => !item.id)"
          class="inline-flex items-center px-3 py-1 rounded-full glass ring ring-default text-sm font-medium"
        >
          {{ album.artists.map((artist) => artist.name).join(', ') }}
        </span>
      </div>

      <UCard>
        <div class="flex flex-col md:flex-row gap-6">
          <UiClickableImage
            :src="album.thumbnailUrl || undefined"
            :alt="album.title"
            :title="album.title"
            shape="rounded"
            placeholder-icon="i-heroicons-musical-note"
            use-fade-image
            class="w-44 h-44 md:w-56 md:h-56 shrink-0"
          />
          <div class="flex flex-col flex-1 min-w-0 w-full gap-3">
            <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
              {{ album.title }}
            </h1>
            <UAlert
              v-if="actionError"
              color="error"
              variant="soft"
              :title="actionError"
              icon="i-heroicons-exclamation-triangle"
            />
            <span class="flex-1" />
            <div class="flex flex-wrap gap-6 text-sm">
              <div class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.songCount') }}
                </h4>
                <p class="leading-normal">
                  {{ t('album.songCount', album.tracks.length) }}
                  <span v-if="totalDurationFormatted">({{ totalDurationFormatted }})</span>
                </p>
              </div>
              <div v-if="album.year" class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.releaseDate') }}
                </h4>
                <p class="leading-normal">
                  {{ album.year }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              :loading="playing"
              :disabled="!selectedDeviceId || playing || queueTracks.length === 0"
              icon="i-heroicons-play"
              size="lg"
              class="rounded-full"
              @click="playFrom(0)"
            >
              {{ t('album.play') }}
            </UButton>
            <UButton
              :disabled="!selectedDeviceId || queueTracks.length === 0"
              :label="t('album.addToQueue')"
              icon="i-heroicons-queue-list"
              variant="ghost"
              size="sm"
              @click="addToQueue"
            />
          </div>
        </template>
      </UCard>

      <UEmpty
        v-if="album.tracks.length === 0"
        icon="i-heroicons-musical-note"
        :title="t('ytm.album.noTracks')"
      />
      <UCard
        v-else
        :ui="{ body: '!p-0' }"
        class="overflow-hidden"
      >
        <div class="flex flex-col divide-y divide-(--ui-border)">
          <button
            v-for="(track, index) in album.tracks"
            :key="track.videoId"
            type="button"
            class="relative flex items-center gap-4 px-4 py-3 text-left hover:bg-accented/40 transition-colors disabled:opacity-50"
            :class="[
              currentPlayingVideoId === track.videoId ? 'bg-primary/5' : '',
              isSelected('album-tracks', track.videoId) ? 'ring-2 ring-primary bg-primary/10' : '',
            ]"
            :disabled="!selectedDeviceId || playing"
            @click="onTrackClick($event, index)"
          >
            <div class="relative flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-accented/50">
              <UIcon
                v-if="isSelected('album-tracks', track.videoId)"
                name="i-heroicons-check"
                class="w-4 h-4 text-primary"
              />
              <UIcon
                v-else-if="currentPlayingVideoId === track.videoId && player.isPlaying.value"
                name="i-heroicons-play"
                class="w-4 h-4 text-primary animate-pulse"
              />
              <span
                v-else
                class="text-sm font-medium text-muted"
              >
                {{ track.trackNumber || index + 1 }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <span
                class="font-semibold truncate block"
                :class="currentPlayingVideoId === track.videoId ? 'text-primary' : ''"
              >
                {{ track.title }}
              </span>
              <p class="text-sm text-muted truncate">
                {{ track.artists.map((artist) => artist.name).filter(Boolean).join(', ') }}
              </p>
            </div>
            <div class="text-sm text-muted shrink-0 w-16 text-right">
              {{ formatTrackDuration(track.durationSec) }}
            </div>
          </button>
        </div>
      </UCard>
    </div>

    <UiSelectionActionBar
      :count="selectionCount"
      :disabled="!selectedDeviceId"
      :playing="playing"
      @play="playSelection"
      @queue="queueSelection"
      @clear="clearSelection"
    />
  </div>
</template>
