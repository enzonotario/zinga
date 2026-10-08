<script lang="ts" setup>
import type { NormalizedAlbum, NormalizedCredit, NormalizedTrack } from '~/providers/types';
import { useLocalStorage } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import useAppBackground from '~/composables/useAppBackground';
import useDevices from '~/composables/useDevices';
import usePlayer from '~/composables/usePlayer';
import useProvider from '~/composables/useProvider';
import useProviderArtwork from '~/composables/useProviderArtwork';
import { toQueueTrack } from '~/utils/queueTracks';
import { formatTime, formatTimeHHMMSS } from '~/utils/time';

interface Props {
  albumId: string
  countryCode?: string
}
type AlbumTrack = NormalizedTrack & {
  creditsByRole: Record<string, string[]>
  durationFormatted: string
};
interface AlbumDisc {
  number: number
  tracks: AlbumTrack[]
  durationFormatted: string
}
const props = withDefaults(defineProps<Props>(), {
  countryCode: 'US',
});
const { t, locale } = useI18n();
const provider = useProvider();
const { getArtistPicture } = useProviderArtwork();
const { selectedDeviceId } = useDevices();
const { setPageBackground, clearPageBackground } = useAppBackground();
const { showExplicitIndicator } = useSettings();
onUnmounted(() => {
  clearPageBackground();
});
const loading = ref(false);
const error = ref<string | null>(null);
const album = ref<NormalizedAlbum | null>(null);
const tracks = ref<NormalizedTrack[]>([]);
const playingUpnp = ref(false);
const playingDiscNumber = ref<number | null>(null);
const playingFromDiscNumber = ref<number | null>(null);
const actionError = ref<string | null>(null);
const isAlbumFav = ref(false);
const loadingAlbumFav = ref(false);
const loadingFavoriteStatus = ref(false);
const favoriteTrackIds = ref<Set<string>>(new Set());
const loadingTrackFavIds = ref<Set<string>>(new Set());
const showLoginModal = ref(false);
const viewMode = useLocalStorage<'grid' | 'list'>('zinga:album-view-mode', 'grid');
const albumTotalDurationSeconds = computed(() =>
  tracks.value.reduce((acc, t) => acc + (t.duration || 0), 0),
);
const albumTotalDurationFormatted = computed(() => {
  const s = albumTotalDurationSeconds.value;
  return s >= 3600 ? formatTimeHHMMSS(s) : formatTime(s);
});
const trackCredits = ref<Record<string, NormalizedCredit[]>>({});
const loadingCredits = ref(false);
const albumProviders = ref<{ id: string, attributes?: { name?: string } }[]>([]);
const loadingAlbumProviders = ref(false);
const primaryArtistPicture = ref<string | null>(null);
function groupCreditsByRole(credits: NormalizedCredit[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const credit of credits) {
    const role = credit.role || t('artist.other');
    if (!grouped[role]) grouped[role] = [];
    if (credit.name && !grouped[role].includes(credit.name)) {
      grouped[role].push(credit.name);
    }
  }
  return grouped;
}
const albumTracks = computed(() => {
  return tracks.value.map((track) => ({
    ...track,
    creditsByRole: groupCreditsByRole(trackCredits.value[track.id] || []),
    durationFormatted: track.duration
      ? (track.duration >= 3600 ? formatTimeHHMMSS(track.duration) : formatTime(track.duration))
      : '--:--',
  }));
});
function formatDuration(seconds: number) {
  return seconds >= 3600 ? formatTimeHHMMSS(seconds) : formatTime(seconds);
}
const albumDiscs = computed<AlbumDisc[]>(() => {
  const discs = new Map<number, AlbumTrack[]>();
  let fallbackDiscNumber = 1;
  let previousTrackNumber = 0;
  for (const track of albumTracks.value) {
    const trackNumber = track.trackNumber || previousTrackNumber + 1;
    if (!track.volumeNumber && previousTrackNumber > 0 && trackNumber <= previousTrackNumber) {
      fallbackDiscNumber += 1;
    }
    const discNumber = track.volumeNumber || fallbackDiscNumber;
    const discTracks = discs.get(discNumber);
    if (discTracks) {
      discTracks.push(track);
    } else {
      discs.set(discNumber, [track]);
    }
    previousTrackNumber = trackNumber;
  }
  return Array.from(discs.entries())
    .sort(([a], [b]) => a - b)
    .map(([number, discTracks]) => {
      const durationSeconds = discTracks.reduce((acc, track) => acc + (track.duration || 0), 0);
      return {
        number,
        tracks: discTracks,
        durationFormatted: formatDuration(durationSeconds),
      };
    });
});
const hasMultipleDiscs = computed(() => {
  const albumVolumeCount = album.value?.numberOfVolumes || 0;
  return albumVolumeCount > 1 || albumDiscs.value.length > 1;
});
async function loadFavoritesStatus() {
  if (!provider.isUserLoggedIn.value) {
    isAlbumFav.value = false;
    favoriteTrackIds.value = new Set();
    loadingFavoriteStatus.value = false;
    return;
  }
  loadingFavoriteStatus.value = true;
  try {
    const [favAlbumIds, favTrackIds] = await Promise.all([
      provider.getFavoriteAlbumIds(props.countryCode),
      provider.getFavoriteTrackIds(props.countryCode),
    ]);
    isAlbumFav.value = favAlbumIds.includes(props.albumId);
    favoriteTrackIds.value = new Set(favTrackIds);
  } catch (err) {
    console.error('Error loading favorites status:', err);
  } finally {
    loadingFavoriteStatus.value = false;
  }
}
async function toggleAlbumFavorite() {
  if (!provider.isUserLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (loadingAlbumFav.value || loadingFavoriteStatus.value) return;
  loadingAlbumFav.value = true;
  try {
    if (isAlbumFav.value) {
      await provider.removeAlbumFromFavorites(props.albumId, props.countryCode);
      isAlbumFav.value = false;
    } else {
      await provider.addAlbumToFavorites(props.albumId, props.countryCode);
      isAlbumFav.value = true;
    }
  } catch (err) {
    console.error('Error toggling album favorite:', err);
    actionError.value = err instanceof Error ? err.message : t('album.errorFavorite');
  } finally {
    loadingAlbumFav.value = false;
  }
}
async function toggleTrackFavorite(trackId: string) {
  if (!provider.isUserLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (loadingTrackFavIds.value.has(trackId)) return;
  loadingTrackFavIds.value.add(trackId);
  try {
    if (favoriteTrackIds.value.has(trackId)) {
      await provider.removeTrackFromFavorites(trackId, props.countryCode);
      favoriteTrackIds.value.delete(trackId);
      favoriteTrackIds.value = new Set(favoriteTrackIds.value);
    } else {
      await provider.addTrackToFavorites(trackId, props.countryCode);
      favoriteTrackIds.value.add(trackId);
      favoriteTrackIds.value = new Set(favoriteTrackIds.value);
    }
  } catch (err) {
    console.error('Error toggling track favorite:', err);
  } finally {
    loadingTrackFavIds.value.delete(trackId);
    loadingTrackFavIds.value = new Set(loadingTrackFavIds.value);
  }
}
function onLoginSuccess() {
  showLoginModal.value = false;
  loadFavoritesStatus();
}
const player = usePlayer();
function albumQueueTrack(track: NormalizedTrack) {
  return toQueueTrack(track, album.value);
}
async function playTracks(trackList: NormalizedTrack[], setLoading: (loading: boolean) => void) {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  if (trackList.length === 0) return;
  try {
    setLoading(true);
    actionError.value = null;
    await player.playTracks(trackList.map(albumQueueTrack));
    await navigateTo('/');
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : t('album.playbackError');
    console.error('Playback error:', err);
  } finally {
    setLoading(false);
  }
}
async function playAlbum() {
  await playTracks(tracks.value, (value) => {
    playingUpnp.value = value;
  });
}
async function playDisc(disc: AlbumDisc) {
  await playTracks(disc.tracks, (value) => {
    playingDiscNumber.value = value ? disc.number : null;
  });
}
async function playFromDisc(disc: AlbumDisc) {
  const discIndex = albumDiscs.value.findIndex((d) => d.number === disc.number);
  if (discIndex === -1) return;
  const tracksFromDisc = albumDiscs.value.slice(discIndex).flatMap((d) => d.tracks);
  await playTracks(tracksFromDisc, (value) => {
    playingFromDiscNumber.value = value ? disc.number : null;
  });
}
function addAlbumToQueue() {
  if (!selectedDeviceId.value) {
    actionError.value = t('album.noPlaybackDevice');
    return;
  }
  actionError.value = null;
  player.addTracks(tracks.value.map(albumQueueTrack));
}
const albumTitle = computed(() => album.value?.title || t('album.unknown'));
const albumReleaseDate = computed(() => album.value?.releaseDate);
const albumNumberOfItems = computed(() => album.value?.numberOfTracks);
const albumCover = computed(() => album.value?.coverUrl);
const albumArtists = computed(() => album.value?.artists || []);
const albumFavoriteLabel = computed(() => {
  if (loadingFavoriteStatus.value) return t('album.loadingFavorite');
  return isAlbumFav.value ? t('album.removeFavorite') : t('album.addFavorite');
});
const currentPlayingTrackId = computed(() => {
  const uri = player.currentItem.value?.track.uri;
  if (!uri?.startsWith('tidal:track:')) return null;
  return uri.split(':').pop();
});
async function loadAllTrackCredits() {
  if (loadingCredits.value) return;
  loadingCredits.value = true;
  for (const track of tracks.value) {
    try {
      const credits = await provider.getTrackCredits(track.id, props.countryCode);
      trackCredits.value[track.id] = credits;
    } catch (err) {
      console.error(`Error cargando créditos del track ${track.id}:`, err);
    }
  }
  trackCredits.value = { ...trackCredits.value };
  loadingCredits.value = false;
}
async function loadAlbumProviders() {
  if (!props.albumId) return;
  loadingAlbumProviders.value = true;
  try {
    const result = await provider.getAlbumProviders(props.albumId, props.countryCode);
    albumProviders.value = result?.included?.filter((item: any) => item.type === 'providers') || [];
  } catch (err) {
    console.error('Error loading album providers:', err);
  } finally {
    loadingAlbumProviders.value = false;
  }
}
async function loadPrimaryArtistPicture() {
  const firstArtist = album.value?.artists?.[0];
  if (!firstArtist?.id) {
    primaryArtistPicture.value = null;
    return;
  }
  try {
    primaryArtistPicture.value = await getArtistPicture(firstArtist.id, props.countryCode, 320);
  } catch (err) {
    console.error('Error loading artist picture:', err);
    primaryArtistPicture.value = null;
  }
}
const formattedReleaseDate = computed(() => {
  if (!albumReleaseDate.value) return null;
  try {
    return new Date(albumReleaseDate.value).toLocaleDateString(locale.value, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return albumReleaseDate.value;
  }
});
const mediaTagLabels: Record<string, string> = {
  HIRES_LOSSLESS: 'Hi-Res Lossless',
  LOSSLESS: 'Lossless',
  DOLBY_ATMOS: 'Dolby Atmos',
  SONY_360RA: 'Sony 360 Reality Audio',
  MQA: 'MQA',
};
async function loadAlbum() {
  loading.value = true;
  error.value = null;
  primaryArtistPicture.value = null;
  isAlbumFav.value = false;
  favoriteTrackIds.value = new Set();
  try {
    const [albumData, albumTracks] = await Promise.all([
      provider.getAlbum(props.albumId, props.countryCode),
      provider.getAlbumTracks(props.albumId, props.countryCode),
    ]);
    album.value = albumData;
    tracks.value = albumTracks;
    loadFavoritesStatus();
    loadAllTrackCredits();
    loadAlbumProviders();
    loadPrimaryArtistPicture();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('album.notFoundDescription');
    console.error('Error cargando álbum:', err);
  } finally {
    loading.value = false;
  }
}
onMounted(() => loadAlbum());
watch(() => props.albumId, () => loadAlbum());
watch(albumCover, (cover) => setPageBackground(cover), { immediate: true });
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
    <div v-else-if="album" class="flex flex-col gap-6">
      <div v-if="albumArtists.length > 0" class="flex">
        <NuxtLink
          :to="`/artist/${albumArtists[0].id}`"
          class="inline-flex items-center gap-2 px-3 py-1 rounded-full glass ring ring-default hover:bg-accented/40 transition-colors group"
        >
          <div class="w-6 h-6 shrink-0 rounded-full overflow-hidden bg-accented/50 flex items-center justify-center">
            <img
              v-if="primaryArtistPicture"
              :src="primaryArtistPicture"
              :alt="albumArtists[0]?.name"
              class="w-full h-full object-cover"
            >
            <UIcon
              v-else
              name="i-heroicons-user-circle"
              class="w-4 h-4 text-muted"
            />
          </div>
          <span class="text-sm font-medium group-hover:underline">
            {{ albumArtists.map(a => a.name).join(', ') }}
          </span>
        </NuxtLink>
      </div>
      <UCard>
        <div class="flex flex-col md:flex-row gap-6">
          <UiClickableImage
            :src="albumCover"
            :alt="albumTitle"
            :title="albumTitle"
            shape="rounded"
            placeholder-icon="i-heroicons-musical-note"
            use-fade-image
            class="w-44 h-44 md:w-56 md:h-56 shrink-0"
          />
          <div class="flex flex-col flex-1 min-w-0 w-full gap-3">
            <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight flex items-center gap-3">
              {{ albumTitle }}
              <UBadge
                v-if="album.explicit && showExplicitIndicator"
                variant="subtle"
                color="neutral"
                class="text-xs font-bold"
              >
                {{ t('album.explicit') }}
              </UBadge>
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
              <div v-if="albumNumberOfItems" class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.songCount') }}
                </h4>
                <p class="leading-normal">
                  {{ t('album.songCount', albumNumberOfItems || 0) }}
                  <span v-if="albumTotalDurationFormatted">({{ albumTotalDurationFormatted }})</span>
                </p>
              </div>
              <div v-if="formattedReleaseDate" class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.releaseDate') }}
                </h4>
                <p class="leading-normal">
                  {{ formattedReleaseDate }}
                </p>
              </div>
              <div class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.recordLabel') }}
                </h4>
                <USkeleton v-if="loadingAlbumProviders" class="h-5 w-32" />
                <div v-else-if="albumProviders.length > 0" class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="prov in albumProviders"
                    :key="prov.id"
                    :label="prov.attributes?.name || t('album.creditsModal.unknownLabel')"
                    variant="subtle"
                  />
                </div>
                <p v-else class="text-muted">
                  —
                </p>
              </div>
              <div v-if="album?.mediaTags?.length" class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.audioQuality') }}
                </h4>
                <div class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="tag in album.mediaTags"
                    :key="tag"
                    :label="mediaTagLabels[tag] || tag"
                    variant="subtle"
                  />
                </div>
              </div>
              <div v-if="album?.copyright" class="flex flex-col gap-1">
                <h4 class="text-xs font-medium text-muted uppercase tracking-wide">
                  {{ t('album.creditsModal.copyright') }}
                </h4>
                <p class="text-muted leading-normal">
                  {{ album.copyright }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              :loading="playingUpnp"
              :disabled="!selectedDeviceId || playingUpnp || playingDiscNumber !== null || playingFromDiscNumber !== null"
              icon="i-heroicons-play"
              size="lg"
              class="rounded-full"
              @click="playAlbum"
            >
              {{ t('album.play') }}
            </UButton>
            <UButton
              :disabled="!selectedDeviceId"
              :label="t('album.addToQueue')"
              icon="i-heroicons-queue-list"
              variant="ghost"
              size="sm"
              @click="addAlbumToQueue"
            />

            <span class="flex-1" />
            <UButton
              :label="albumFavoriteLabel"
              :icon="isAlbumFav ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
              :color="isAlbumFav ? 'error' : 'neutral'"
              variant="ghost"
              size="sm"
              :loading="loadingAlbumFav || loadingFavoriteStatus"
              :disabled="loadingFavoriteStatus"
              :class="isAlbumFav ? 'text-red-500' : ''"
              :aria-label="albumFavoriteLabel"
              @click="toggleAlbumFavorite"
            />
          </div>
        </template>
      </UCard>
      <div v-if="albumTracks.length > 0" class="flex flex-col gap-3">
        <div class="flex items-center justify-end py-2">
          <div class="flex items-center gap-1 glass ring ring-default rounded-lg p-1">
            <UButton
              icon="i-heroicons-squares-2x2"
              :variant="viewMode === 'grid' ? 'solid' : 'ghost'"
              size="sm"
              class="rounded-md"
              @click="viewMode = 'grid'"
            />
            <UButton
              icon="i-heroicons-list-bullet"
              :variant="viewMode === 'list' ? 'solid' : 'ghost'"
              size="sm"
              class="rounded-md"
              @click="viewMode = 'list'"
            />
          </div>
        </div>
        <div v-if="viewMode === 'grid'" class="flex flex-col gap-6">
          <section
            v-for="disc in albumDiscs"
            :key="`grid-disc-${disc.number}`"
            class="flex flex-col gap-3"
          >
            <div v-if="hasMultipleDiscs" class="flex flex-wrap items-center justify-between gap-3 glass ring ring-default rounded-lg px-4 py-3">
              <div class="flex flex-col">
                <h2 class="text-xl font-semibold">
                  CD {{ disc.number }}
                </h2>
                <span class="text-sm text-muted">
                  {{ t('album.songCount', disc.tracks.length) }} · {{ disc.durationFormatted }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  :label="t('album.playDisc', { number: disc.number })"
                  :loading="playingDiscNumber === disc.number"
                  :disabled="!selectedDeviceId || playingUpnp || playingFromDiscNumber !== null || (playingDiscNumber !== null && playingDiscNumber !== disc.number)"
                  icon="i-heroicons-play"
                  variant="ghost"
                  size="sm"
                  @click="playDisc(disc)"
                />
                <UButton
                  :label="t('album.playFromDisc', { number: disc.number })"
                  :loading="playingFromDiscNumber === disc.number"
                  :disabled="!selectedDeviceId || playingUpnp || playingDiscNumber !== null || (playingFromDiscNumber !== null && playingFromDiscNumber !== disc.number)"
                  icon="i-heroicons-play"
                  variant="ghost"
                  size="sm"
                  @click="playFromDisc(disc)"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <UCard
                v-for="(track, index) in disc.tracks"
                :key="track.id"
                :class="currentPlayingTrackId === track.id ? 'ring-2 ring-primary' : ''"
              >
                <div class="flex flex-col gap-3">
                  <div class="flex items-start gap-3">
                    <div class="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-accented/50">
                      <UIcon
                        v-if="currentPlayingTrackId === track.id && player.isPlaying.value"
                        name="i-heroicons-play"
                        class="w-4 h-4 text-primary animate-pulse"
                      />
                      <UIcon
                        v-else-if="currentPlayingTrackId === track.id && player.isPaused.value"
                        name="i-heroicons-pause"
                        class="w-4 h-4 text-primary"
                      />
                      <span v-else class="text-sm font-medium text-muted">
                        {{ track.trackNumber || index + 1 }}
                      </span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 leading-normal">
                        <h3
                          class="font-semibold leading-normal flex items-center gap-2"
                          :class="currentPlayingTrackId === track.id ? 'text-primary' : ''"
                        >
                          {{ track.title }}
                          <UIcon
                            v-if="track.explicit && showExplicitIndicator"
                            name="i-heroicons-exclamation-circle"
                            class="w-3.5 h-3.5 text-warning shrink-0"
                          />
                        </h3>
                      </div>
                      <div v-if="loadingCredits" class="flex items-center gap-1 leading-normal min-h-5">
                        <USkeleton class="h-4 w-20" />
                      </div>
                      <p
                        v-else-if="track.creditsByRole.Composer"
                        class="text-sm text-muted leading-normal"
                      >
                        {{ track.creditsByRole.Composer.join(', ') }}
                      </p>
                      <p
                        v-else
                        class="text-sm text-muted leading-normal"
                      >
                        {{ albumArtists.map(a => a.name).join(', ') }}
                      </p>
                    </div>
                    <div class="text-sm text-muted shrink-0 leading-normal">
                      {{ track.durationFormatted }}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <UButton
                        :icon="favoriteTrackIds.has(track.id) ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
                        :color="favoriteTrackIds.has(track.id) ? 'error' : 'neutral'"
                        variant="ghost"
                        size="xs"
                        :loading="loadingTrackFavIds.has(track.id)"
                        :class="favoriteTrackIds.has(track.id) ? 'text-red-500' : ''"
                        @click="toggleTrackFavorite(track.id)"
                      />
                    </div>
                  </div>
                  <UiTrackCredits
                    :loading="loadingCredits"
                    :credits-by-role="track.creditsByRole"
                  />
                </div>
              </UCard>
            </div>
          </section>
        </div>
        <div
          v-else
          class="flex flex-col gap-6"
        >
          <section
            v-for="disc in albumDiscs"
            :key="`list-disc-${disc.number}`"
            class="flex flex-col gap-3"
          >
            <div v-if="hasMultipleDiscs" class="flex flex-wrap items-center justify-between gap-3 glass ring ring-default rounded-lg px-4 py-3">
              <div class="flex flex-col">
                <h2 class="text-xl font-semibold">
                  CD {{ disc.number }}
                </h2>
                <span class="text-sm text-muted">
                  {{ t('album.songCount', disc.tracks.length) }} · {{ disc.durationFormatted }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  :label="t('album.playDisc', { number: disc.number })"
                  :loading="playingDiscNumber === disc.number"
                  :disabled="!selectedDeviceId || playingUpnp || playingFromDiscNumber !== null || (playingDiscNumber !== null && playingDiscNumber !== disc.number)"
                  icon="i-heroicons-play"
                  variant="ghost"
                  size="sm"
                  @click="playDisc(disc)"
                />
                <UButton
                  :label="t('album.playFromDisc', { number: disc.number })"
                  :loading="playingFromDiscNumber === disc.number"
                  :disabled="!selectedDeviceId || playingUpnp || playingDiscNumber !== null || (playingFromDiscNumber !== null && playingFromDiscNumber !== disc.number)"
                  icon="i-heroicons-play"
                  variant="ghost"
                  size="sm"
                  @click="playFromDisc(disc)"
                />
              </div>
            </div>
            <UCard
              :ui="{ body: '!p-0' }"
              class="overflow-hidden"
            >
              <div class="flex flex-col divide-y divide-(--ui-border)">
                <div
                  v-for="(track, index) in disc.tracks"
                  :key="track.id"
                  class="flex items-center gap-4 px-4 py-3 hover:bg-accented/40 transition-colors"
                  :class="currentPlayingTrackId === track.id ? 'bg-primary/5' : ''"
                >
                  <div class="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-accented/50">
                    <UIcon
                      v-if="currentPlayingTrackId === track.id && player.isPlaying.value"
                      name="i-heroicons-play"
                      class="w-4 h-4 text-primary animate-pulse"
                    />
                    <UIcon
                      v-else-if="currentPlayingTrackId === track.id && player.isPaused.value"
                      name="i-heroicons-pause"
                      class="w-4 h-4 text-primary"
                    />
                    <span v-else class="text-sm font-medium text-muted">
                      {{ track.trackNumber || index + 1 }}
                    </span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span
                        class="font-semibold truncate"
                        :class="currentPlayingTrackId === track.id ? 'text-primary' : ''"
                      >
                        {{ track.title }}
                      </span>
                      <UIcon
                        v-if="track.explicit && showExplicitIndicator"
                        name="i-heroicons-exclamation-circle"
                        class="w-3.5 h-3.5 text-warning shrink-0"
                      />
                    </div>
                    <p class="text-sm text-muted truncate">
                      {{ track.creditsByRole.Composer?.join(', ') || albumArtists.map(a => a.name).join(', ') }}
                    </p>
                    <UiTrackCredits
                      :loading="loadingCredits"
                      :credits-by-role="track.creditsByRole"
                      class="mt-1"
                    />
                  </div>
                  <div class="text-sm text-muted shrink-0 w-16 text-right">
                    {{ track.durationFormatted }}
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <UButton
                      :icon="favoriteTrackIds.has(track.id) ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
                      :color="favoriteTrackIds.has(track.id) ? 'error' : 'neutral'"
                      variant="ghost"
                      size="xs"
                      :loading="loadingTrackFavIds.has(track.id)"
                      :class="favoriteTrackIds.has(track.id) ? 'text-red-500' : ''"
                      @click="toggleTrackFavorite(track.id)"
                    />
                  </div>
                </div>
              </div>
            </UCard>
          </section>
        </div>
      </div>
    </div>
    <UEmpty
      v-else
      variant="outline"
      icon="i-heroicons-musical-note"
      :title="t('album.notFound')"
      :description="t('album.notFoundDescription')"
    />
    <UModal v-model:open="showLoginModal">
      <template #content>
        <UCard variant="soft">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ t('auth.login') }}
              </h3>
              <UButton
                icon="i-heroicons-x-mark"
                variant="ghost"
                size="sm"
                @click="showLoginModal = false"
              />
            </div>
          </template>
          <ProviderDeviceLogin
            @success="onLoginSuccess"
            @cancel="showLoginModal = false"
          />
        </UCard>
      </template>
    </UModal>
  </div>
</template>
