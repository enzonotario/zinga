<script lang="ts" setup>
import type { NormalizedAlbum, NormalizedCredit, NormalizedTrack } from '~/providers/types';
import { useLocalStorage } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import useAppBackground from '~/composables/useAppBackground';
import useDevices from '~/composables/useDevices';
import useMopidy from '~/composables/useMopidy';
import usePlayer from '~/composables/usePlayer';
import useProvider from '~/composables/useProvider';
import useProviderArtwork from '~/composables/useProviderArtwork';
import { formatTime, formatTimeHHMMSS } from '~/utils/time';

interface Props {
  albumId: string
  countryCode?: string
}
const props = withDefaults(defineProps<Props>(), {
  countryCode: 'US',
});
const { t, locale } = useI18n();
const provider = useProvider();
const { getArtistPicture } = useProviderArtwork();
const mopidy = useMopidy();
const { selectedDeviceId } = useDevices();
const { setPageBackground, clearPageBackground } = useAppBackground();
const { showExplicitIndicator } = useSettings();
let pollingInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  pollingInterval = setInterval(async () => {
    if (mopidy.isPlaying.value) {
      await mopidy.refreshState();
      await mopidy.getTracklist();
    }
  }, 2000);
});
onUnmounted(() => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  clearPageBackground();
});
const loading = ref(false);
const error = ref<string | null>(null);
const album = ref<NormalizedAlbum | null>(null);
const tracks = ref<NormalizedTrack[]>([]);
const playingUpnp = ref(false);
const mopidyError = ref<string | null>(null);
const isAlbumFav = ref(false);
const loadingAlbumFav = ref(false);
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
async function loadFavoritesStatus() {
  if (!provider.isUserLoggedIn.value) return;
  try {
    isAlbumFav.value = await provider.isAlbumFavorite(props.albumId, props.countryCode);
    const favTrackIds = await provider.getFavoriteTrackIds(props.countryCode);
    favoriteTrackIds.value = new Set(favTrackIds);
  } catch (err) {
    console.error('Error loading favorites status:', err);
  }
}
async function toggleAlbumFavorite() {
  if (!provider.isUserLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (loadingAlbumFav.value) return;
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
    mopidyError.value = err instanceof Error ? err.message : t('album.errorFavorite');
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
async function playAlbum() {
  if (!selectedDeviceId.value) {
    mopidyError.value = t('album.noPlaybackDevice');
    return;
  }
  try {
    playingUpnp.value = true;
    mopidyError.value = null;
    const connected = await mopidy.mopidyRpc('core.get_version').then(() => true).catch(() => false);
    if (!connected) {
      throw new Error(t('album.mopidyUnavailable'));
    }
    await mopidy.clear();
    const trackUris = tracks.value.map((t) => t.uri || `tidal:track:${t.id}`);
    await mopidy.add(trackUris);
    await player.play();
    await navigateTo('/');
  } catch (err) {
    mopidyError.value = err instanceof Error ? err.message : t('album.playbackError');
    console.error('Playback error:', err);
  } finally {
    playingUpnp.value = false;
  }
}
const albumTitle = computed(() => album.value?.title || t('album.unknown'));
const albumReleaseDate = computed(() => album.value?.releaseDate);
const albumNumberOfItems = computed(() => album.value?.numberOfTracks);
const albumCover = computed(() => album.value?.coverUrl);
const albumArtists = computed(() => album.value?.artists || []);
const currentPlayingTrackId = computed(() => {
  if (!mopidy.currentTrack.value?.track?.uri) return null;
  const parts = mopidy.currentTrack.value.track.uri.split(':');
  return parts[parts.length - 1];
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
          class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elevated hover:bg-elevated-hover border border-border transition-colors group"
        >
          <div class="w-6 h-6 shrink-0 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
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
              v-if="mopidyError"
              color="error"
              variant="soft"
              :title="mopidyError"
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
              :disabled="!selectedDeviceId || playingUpnp"
              icon="i-heroicons-play"
              size="lg"
              class="rounded-full"
              @click="playAlbum"
            >
              {{ t('album.play') }}
            </UButton>
            <UButton
              :label="isAlbumFav ? t('album.removeFavorite') : t('album.addFavorite')"
              :icon="isAlbumFav ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
              :color="isAlbumFav ? 'error' : 'neutral'"
              variant="ghost"
              size="sm"
              :loading="loadingAlbumFav"
              class="hover:bg-white/10"
              :class="isAlbumFav ? 'text-red-500' : ''"
              :aria-label="isAlbumFav ? t('album.removeFavorite') : t('album.addFavorite')"
              @click="toggleAlbumFavorite"
            />
          </div>
        </template>
      </UCard>
      <div v-if="albumTracks.length > 0" class="flex flex-col gap-3">
        <div
          v-if="loadingCredits"
          class="flex items-center gap-2 text-sm text-muted leading-normal py-1"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin shrink-0" />
          <span class="leading-normal">{{ t('album.loadingCredits') }}</span>
        </div>
        <div class="flex items-center justify-end py-2">
          <div class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
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
        <div v-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <UCard
            v-for="(track, index) in albumTracks"
            :key="track.id"
            :class="currentPlayingTrackId === track.id ? 'ring-2 ring-primary' : ''"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-start gap-3">
                <div class="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <UIcon
                    v-if="currentPlayingTrackId === track.id && mopidy.isPlaying.value"
                    name="i-heroicons-play"
                    class="w-4 h-4 text-primary animate-pulse"
                  />
                  <UIcon
                    v-else-if="currentPlayingTrackId === track.id && mopidy.isPaused.value"
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
        <UCard
          v-else
          :ui="{ body: 'p-0' }"
          class="overflow-hidden"
        >
          <div class="flex flex-col divide-y divide-border">
            <div
              v-for="(track, index) in albumTracks"
              :key="track.id"
              class="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
              :class="currentPlayingTrackId === track.id ? 'bg-primary/5' : ''"
            >
              <div class="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800">
                <UIcon
                  v-if="currentPlayingTrackId === track.id && mopidy.isPlaying.value"
                  name="i-heroicons-play"
                  class="w-4 h-4 text-primary animate-pulse"
                />
                <UIcon
                  v-else-if="currentPlayingTrackId === track.id && mopidy.isPaused.value"
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
      </div>
    </div>
    <UEmpty
      v-else
      icon="i-heroicons-musical-note"
      :title="t('album.notFound')"
      :description="t('album.notFoundDescription')"
    />
    <UModal v-model:open="showLoginModal">
      <template #content>
        <UCard>
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
