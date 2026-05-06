<script lang="ts" setup>
import type { NormalizedAlbum, NormalizedArtist, NormalizedSimilarArtist } from '~/providers/types';
import { useLocalStorage } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import useAppBackground from '~/composables/useAppBackground';
import useProvider from '~/composables/useProvider';
import useProviderArtwork from '~/composables/useProviderArtwork';
import useRequestQueue from '~/composables/useRequestQueue';

interface Props {
  artistId: string
  countryCode?: string
}
const props = withDefaults(defineProps<Props>(), {
  countryCode: 'US',
});
const provider = useProvider();
const { getArtistPicture, getAlbumCover } = useProviderArtwork();
const { t } = useI18n();
const requestQueue = useRequestQueue();
const { setPageBackground, clearPageBackground } = useAppBackground();
const { showExplicitIndicator } = useSettings();
requestQueue.setConcurrency(1);
requestQueue.setDelay(500);
const loading = ref(false);
const error = ref<string | null>(null);
const artist = ref<NormalizedArtist | null>(null);
const similarArtists = ref<NormalizedSimilarArtist[]>([]);
const similarArtistsPictures = ref<Record<string, string | null>>({});
const albumCovers = ref<Record<string, string | null>>({});
const albums = ref<NormalizedAlbum[]>([]);
const showBiographyModal = ref(false);
const showLoginModal = ref(false);
const isFollowing = ref(false);
const loadingFollow = ref(false);
const loadingFollowStatus = ref(false);
const albumsLoading = ref(false);
const albumsError = ref<string | null>(null);
const viewMode = useLocalStorage<'grid' | 'list'>('zinga:artist-view-mode', 'grid');
const sortBy = ref<'releaseDate' | 'title'>('releaseDate');
const sortOrder = ref<'asc' | 'desc'>('desc');
const artistName = computed(() => artist.value?.name || t('artist.unknown'));
const artistPicture = computed(() => artist.value?.picture);
const artistBiography = computed(() => artist.value?.biography || null);
const artistAlbums = computed(() => {
  const sorted = [...albums.value];
  sorted.sort((a, b) => {
    let comparison = 0;
    if (sortBy.value === 'releaseDate') {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      comparison = dateA - dateB;
    } else if (sortBy.value === 'title') {
      comparison = (a.title || '').localeCompare(b.title || '');
    }
    return sortOrder.value === 'asc' ? comparison : -comparison;
  });
  return sorted.map((album) => ({
    ...album,
    coverUrl: album.coverUrl || albumCovers.value[album.id] || undefined,
  }));
});
const albumTypeNames = computed<Record<string, string>>(() => ({
  ALBUM: t('artist.albums'),
  EP: t('artist.eps'),
  SINGLE: t('artist.singles'),
  COMPILATION: t('artist.compilations'),
  OTHER: t('artist.other'),
}));
const albumsByType = computed(() => {
  const grouped: Record<string, NormalizedAlbum[]> = {};
  artistAlbums.value.forEach((album) => {
    const type = album.type || 'ALBUM';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(album);
  });
  const typeOrder = ['ALBUM', 'EP', 'SINGLE', 'COMPILATION'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const indexA = typeOrder.indexOf(a);
    const indexB = typeOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
  return sortedTypes.map((type) => ({
    type,
    typeName: albumTypeNames.value[type] || type,
    albums: grouped[type],
  }));
});
const similarArtistsWithPictures = computed(() =>
  similarArtists.value.map((a) => ({
    ...a,
    picture: a.picture || similarArtistsPictures.value[a.id] || undefined,
  })),
);
async function loadAlbums() {
  albumsLoading.value = true;
  albumsError.value = null;
  albums.value = [];
  albumCovers.value = {};
  try {
    albums.value = await provider.getAlbumsByArtist(props.artistId, props.countryCode);
    loadAlbumCovers();
  } catch (err) {
    albumsError.value = err instanceof Error ? err.message : t('artist.errorLoadingAlbums');
    console.error('Error loading albums:', err);
  } finally {
    albumsLoading.value = false;
  }
}
function loadAlbumCovers() {
  for (const album of albums.value) {
    if (album.coverUrl) {
      albumCovers.value[album.id] = album.coverUrl;
      continue;
    }
    requestQueue.enqueue(
      async () => {
        try {
          const cover = await getAlbumCover(album.id, props.countryCode, 320);
          if (cover) albumCovers.value[album.id] = cover;
        } catch (err) {
          console.error(`Error loading album cover ${album.id}:`, err);
        }
      },
      3,
      1000,
    ).catch(() => {});
  }
}
async function loadSimilarArtistsPictures() {
  if (!similarArtists.value.length) return;
  similarArtistsPictures.value = {};
  for (const a of similarArtists.value) {
    if (a.picture) {
      similarArtistsPictures.value[a.id] = a.picture;
      continue;
    }
    requestQueue.enqueue(
      async () => {
        try {
          const picture = await getArtistPicture(a.id, props.countryCode, 320);
          if (picture) similarArtistsPictures.value[a.id] = picture;
        } catch (err) {
          console.error(`Error loading artist picture ${a.id}:`, err);
        }
      },
      3,
      1000,
    ).catch(() => {});
  }
}
async function loadArtist() {
  loading.value = true;
  error.value = null;
  similarArtistsPictures.value = {};
  requestQueue.clear();
  try {
    const result = await provider.getArtistWithDetails(props.artistId, props.countryCode);
    artist.value = result.artist;
    similarArtists.value = result.similarArtists;
    loadFollowStatus();
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('artist.errorLoadingArtist');
    console.error('Error loading artist:', err);
  } finally {
    loading.value = false;
  }
  loadAlbums()
    .catch((err) => console.error('Error loading albums:', err))
    .finally(() => {
      loadSimilarArtistsPictures().catch((err) => {
        console.error('Error loading similar artists pictures:', err);
      });
    });
}
async function loadFollowStatus() {
  if (!provider.isUserLoggedIn.value) return;
  loadingFollowStatus.value = true;
  try {
    isFollowing.value = await provider.isArtistFollowed(props.artistId, props.countryCode);
  } catch (err) {
    console.error('Error cargando estado de seguimiento:', err);
  } finally {
    loadingFollowStatus.value = false;
  }
}
async function toggleFollow() {
  if (!provider.isUserLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (loadingFollow.value) return;
  loadingFollow.value = true;
  try {
    if (isFollowing.value) {
      await provider.unfollowArtist(props.artistId, props.countryCode);
      isFollowing.value = false;
    } else {
      await provider.followArtist(props.artistId, props.countryCode);
      isFollowing.value = true;
    }
  } catch (err) {
    console.error('Error al cambiar seguimiento del artista:', err);
  } finally {
    loadingFollow.value = false;
  }
}
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
function onLoginSuccess() {
  showLoginModal.value = false;
  loadFollowStatus();
}
onMounted(() => loadArtist());
watch(() => props.artistId, () => loadArtist());
watch(artistPicture, (picture) => setPageBackground(picture), { immediate: true });
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
    <div v-else-if="artist" class="flex flex-col gap-6">
      <UCard>
        <div class="flex flex-col md:flex-row gap-6">
          <UiClickableImage
            :src="artistPicture"
            :alt="artistName"
            :title="artistName"
            shape="rounded"
            placeholder-icon="i-heroicons-user"
            use-fade-image
            class="w-44 h-44 md:w-56 md:h-56 shrink-0"
          />
          <div class="flex flex-col justify-end flex-1 min-w-0 w-full gap-3">
            <h1 class="text-3xl md:text-4xl xl:text-5xl font-bold leading-tight">
              {{ artistName }}
            </h1>
            <span class="flex-1" />
          </div>
        </div>
        <template #footer>
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              :icon="isFollowing ? 'i-heroicons-check-circle' : 'i-heroicons-plus-circle'"
              :label="isFollowing ? t('artist.following') : t('artist.follow')"
              :color="isFollowing ? 'error' : 'neutral'"
              variant="ghost"
              size="sm"
              :loading="loadingFollow || loadingFollowStatus"
              :class="isFollowing ? 'text-teal-500' : ''"
              :aria-label="isFollowing ? t('artist.unfollow') : t('artist.follow')"
              @click="toggleFollow"
            />
          </div>
        </template>
      </UCard>
      <div v-if="albumsLoading || albumsByType.length > 0 || albumsError" class="space-y-6">
        <template v-if="albumsLoading">
          <UCard v-for="type in [t('artist.albums'), t('artist.singles')]" :key="type">
            <template #header>
              <div class="flex items-center justify-between">
                <USkeleton class="h-7 w-32" />
                <USkeleton class="h-5 w-24 rounded-full" />
              </div>
            </template>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              <div
                v-for="i in 6"
                :key="i"
                class="flex flex-col gap-2 p-3"
              >
                <USkeleton class="aspect-square w-full rounded-lg" />
                <div class="space-y-2">
                  <USkeleton class="h-4 w-full" />
                  <USkeleton class="h-3 w-3/4" />
                  <USkeleton class="h-3 w-1/2" />
                </div>
              </div>
            </div>
          </UCard>
        </template>
        <UAlert
          v-else-if="albumsError"
          color="error"
          variant="soft"
          :title="albumsError"
          icon="i-heroicons-exclamation-triangle"
        />
        <template v-else-if="albumsByType.length > 0">
          <div class="flex flex-wrap items-center justify-between gap-4 py-2">
            <div class="flex items-center gap-2">
              <USelectMenu
                v-model="sortBy"
                :items="[
                  { label: t('pages.library.colDate'), value: 'releaseDate' },
                  { label: t('pages.library.colTitle'), value: 'title' },
                ]"
                value-key="value"
                class="w-40"
              >
                <template #leading>
                  <UIcon name="i-heroicons-bars-arrow-down" class="w-4 h-4" />
                </template>
              </USelectMenu>
              <UButton
                :icon="sortOrder === 'asc' ? 'i-heroicons-bars-3-bottom-left' : 'i-heroicons-bars-3-bottom-right'"
                variant="ghost"
                size="sm"
                @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
              />
            </div>
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
          <UCard
            v-for="group in albumsByType"
            :key="group.type"
            class="space-y-4"
            :ui="{ body: viewMode === 'list' ? 'p-0' : '' }"
          >
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold">
                  {{ group.typeName }}
                </h2>
                <UBadge
                  :label="t('artist.releaseCount', group.albums?.length || 0)"
                  variant="soft"
                  size="sm"
                />
              </div>
            </template>
            <div v-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              <NuxtLink
                v-for="album in group.albums"
                :key="album.id"
                :to="`/album/${album.id}`"
                class="flex flex-col gap-2 p-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group"
              >
                <div class="relative aspect-square w-full rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800">
                  <img
                    v-if="album.coverUrl"
                    :src="album.coverUrl"
                    :alt="album.title"
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
                  <div class="font-medium text-sm leading-snug flex items-center gap-1.5" :title="album.title">
                    <span class="truncate">{{ album.title }}</span>
                    <UIcon
                      v-if="album.explicit && showExplicitIndicator"
                      name="i-heroicons-exclamation-circle"
                      class="w-3.5 h-3.5 text-error shrink-0"
                    />
                  </div>
                  <div v-if="album.label" class="text-xs text-muted leading-tight" :title="album.label">
                    {{ album.label }}
                  </div>
                  <div class="flex items-center gap-1 flex-wrap">
                    <span v-if="album.releaseDate" class="text-xs text-muted">
                      {{ new Date(album.releaseDate).getFullYear() }}
                    </span>
                    <span v-if="album.duration" class="text-xs text-muted">
                      · {{ formatDuration(album.duration) }}
                    </span>
                    <UBadge
                      v-if="album.mediaTags?.includes('HIRES_LOSSLESS')"
                      label="Hi-Res"
                      variant="subtle"
                      size="xs"
                    />
                    <UBadge
                      v-else-if="album.mediaTags?.includes('LOSSLESS')"
                      label="Lossless"
                      variant="subtle"
                      size="xs"
                    />
                  </div>
                </div>
              </NuxtLink>
            </div>
            <div v-else class="flex flex-col divide-y divide-border">
              <NuxtLink
                v-for="album in group.albums"
                :key="album.id"
                :to="`/album/${album.id}`"
                class="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors group"
              >
                <div class="w-12 h-12 shrink-0 rounded overflow-hidden bg-neutral-200 dark:bg-neutral-800">
                  <img
                    v-if="album.coverUrl"
                    :src="album.coverUrl"
                    :alt="album.title"
                    class="w-full h-full object-cover"
                  >
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-musical-note" class="w-6 h-6 text-neutral-400" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium truncate group-hover:text-primary transition-colors">
                      {{ album.title }}
                    </span>
                    <UIcon
                      v-if="album.explicit && showExplicitIndicator"
                      name="i-heroicons-exclamation-circle"
                      class="w-3.5 h-3.5 text-error shrink-0"
                    />
                  </div>
                  <div v-if="album.label" class="text-xs text-muted truncate">
                    {{ album.label }}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted mt-0.5">
                    <span v-if="album.releaseDate">
                      {{ new Date(album.releaseDate).getFullYear() }}
                    </span>
                    <span v-if="album.duration">· {{ formatDuration(album.duration) }}</span>
                    <UBadge
                      v-if="album.mediaTags?.includes('HIRES_LOSSLESS')"
                      label="Hi-Res"
                      variant="subtle"
                      size="xs"
                    />
                    <UBadge
                      v-else-if="album.mediaTags?.includes('LOSSLESS')"
                      label="Lossless"
                      variant="subtle"
                      size="xs"
                    />
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted" />
                </div>
              </NuxtLink>
            </div>
          </UCard>
        </template>
        <UEmpty
          v-else
          icon="i-heroicons-musical-note"
          :title="t('artist.noAlbums')"
          :description="t('artist.noAlbumsDescription')"
        />
      </div>
      <UCard v-if="similarArtistsWithPictures.length > 0">
        <template #header>
          <h2 class="text-xl font-semibold">
            {{ t('artist.similarArtists') }}
          </h2>
        </template>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <NuxtLink
            v-for="similar in similarArtistsWithPictures"
            :key="similar.id"
            :to="`/artist/${similar.id}`"
            class="flex flex-col items-center gap-3 p-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group"
          >
            <div class="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 group-hover:scale-105 transition-transform">
              <img
                v-if="similar.picture"
                :src="similar.picture"
                :alt="similar.name"
                class="w-full h-full object-cover"
              >
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-user" class="w-10 h-10 text-neutral-400" />
              </div>
            </div>
            <span class="text-sm font-medium text-center w-full leading-tight">
              {{ similar.name }}
            </span>
          </NuxtLink>
        </div>
      </UCard>
    </div>
    <UEmpty
      v-else
      icon="i-heroicons-user"
      :title="t('artist.notFound')"
      :description="t('artist.notFoundDescription')"
    />
    <UModal v-model:open="showBiographyModal" class="sm:max-w-2xl">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ t('artist.biography') }}
              </h3>
              <UButton
                icon="i-heroicons-x-mark"
                variant="ghost"
                size="sm"
                @click="showBiographyModal = false"
              />
            </div>
          </template>
          <div class="max-h-[60vh] overflow-y-auto">
            <UiWimpText :text="artistBiography" class="text-muted leading-relaxed" />
          </div>
        </UCard>
      </template>
    </UModal>
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
