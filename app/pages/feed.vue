<script lang="ts" setup>
import type { NormalizedAlbum, NormalizedArtist } from '~/providers/types';

definePageMeta({
  name: 'feed',
  nameKey: 'pages.feed.name',
  descriptionKey: 'pages.feed.description',
  icon: 'lucide:layout-grid',
  category: 'main',
});
type ViewMode = 'albums' | 'artists';
const provider = useProvider();
const viewMode = ref<ViewMode>('albums');
const scrollRootRef = ref<HTMLElement | null>(null);
const favoriteAlbums = ref<NormalizedAlbum[]>([]);
const albumNextCursor = ref<string | null>(null);
const albumLoading = ref(false);
const albumLoadingMore = ref(false);
const followedArtists = ref<NormalizedArtist[]>([]);
const artistNextCursor = ref<string | null>(null);
const artistLoading = ref(false);
const artistLoadingMore = ref(false);
const FEED_PAGE_SKELETON_COUNT = 6;
async function loadInitialAlbums() {
  if (!provider.isUserLoggedIn.value || albumLoading.value) return;
  albumLoading.value = true;
  try {
    const { items, nextCursor } = await provider.getFavoriteAlbumsPage();
    favoriteAlbums.value = items;
    albumNextCursor.value = nextCursor;
  } catch (err) {
    console.error('Error cargando álbumes:', err);
  } finally {
    albumLoading.value = false;
  }
}
async function loadMoreAlbums() {
  if (!albumNextCursor.value || albumLoadingMore.value) return;
  albumLoadingMore.value = true;
  try {
    const { items, nextCursor } = await provider.getFavoriteAlbumsPage('US', albumNextCursor.value);
    favoriteAlbums.value = [...favoriteAlbums.value, ...items];
    albumNextCursor.value = nextCursor;
  } catch (err) {
    console.error('Error cargando más álbumes:', err);
  } finally {
    albumLoadingMore.value = false;
  }
}
async function loadInitialArtists() {
  if (!provider.isUserLoggedIn.value || artistLoading.value) return;
  artistLoading.value = true;
  try {
    const { items, nextCursor } = await provider.getFollowedArtistsPage();
    followedArtists.value = items;
    artistNextCursor.value = nextCursor;
  } catch (err) {
    console.error('Error cargando artistas:', err);
  } finally {
    artistLoading.value = false;
  }
}
async function loadMoreArtists() {
  if (!artistNextCursor.value || artistLoadingMore.value) return;
  artistLoadingMore.value = true;
  try {
    const { items, nextCursor } = await provider.getFollowedArtistsPage('US', artistNextCursor.value);
    followedArtists.value = [...followedArtists.value, ...items];
    artistNextCursor.value = nextCursor;
  } catch (err) {
    console.error('Error cargando más artistas:', err);
  } finally {
    artistLoadingMore.value = false;
  }
}
function onInfiniteScroll() {
  if (viewMode.value === 'albums') {
    if (albumNextCursor.value && !albumLoadingMore.value) loadMoreAlbums();
  } else if (artistNextCursor.value && !artistLoadingMore.value) {
    loadMoreArtists();
  }
}
onMounted(() => {
  scrollRootRef.value = document.getElementById('app-scroll');
  if (provider.isUserLoggedIn.value) {
    loadInitialAlbums();
  }
});
useInfiniteScroll(
  scrollRootRef,
  onInfiniteScroll,
  { distance: 300 },
);
watch(() => provider.isUserLoggedIn.value, (loggedIn) => {
  if (loggedIn) {
    loadInitialAlbums();
  }
});
watch(viewMode, (mode) => {
  if (mode === 'artists' && followedArtists.value.length === 0 && !artistLoading.value) {
    loadInitialArtists();
  }
});
</script>

<template>
  <div class="min-h-full pb-32">
    <template v-if="!provider.isUserLoggedIn.value">
      <div class="flex items-center justify-center min-h-[60vh]">
        <UEmpty
          icon="i-heroicons-user-circle"
          :title="$t('pages.feed.loginTitle')"
          :description="$t('pages.feed.loginDescription')"
        >
          <template #actions>
            <ProviderDeviceLogin @success="loadInitialAlbums" />
          </template>
        </UEmpty>
      </div>
    </template>
    <template v-else>
      <div class="flex flex-col gap-4 p-4 md:p-6">
        <UCard
          :ui="{
            body: '!p-0',
          }"
        >
          <UTabs
            v-model="viewMode"
            :items="[
              { label: $t('pages.feed.favoriteAlbums'), value: 'albums', icon: 'i-heroicons-heart' },
              { label: $t('pages.feed.followedArtists'), value: 'artists', icon: 'i-heroicons-users' },
            ]"
            variant="link"
          />
          <div class="px-4">
            <template v-if="viewMode === 'albums'">
              <template v-if="albumLoading">
                <UiSkeletonFeed variant="albums" />
              </template>
              <template v-else-if="favoriteAlbums.length > 0">
                <FeedAlbumCarousel :albums="favoriteAlbums">
                  <template #append>
                    <template v-if="albumLoadingMore">
                      <div
                        v-for="i in FEED_PAGE_SKELETON_COUNT"
                        :key="`album-skel-${i}`"
                        class="flex flex-col gap-2 p-3"
                      >
                        <USkeleton class="aspect-square w-full rounded-lg" />
                        <USkeleton class="h-4 w-full" />
                        <USkeleton class="h-3 w-3/4" />
                        <USkeleton class="h-3 w-1/2" />
                      </div>
                    </template>
                  </template>
                </FeedAlbumCarousel>
              </template>
              <UEmpty
                v-else
                icon="i-heroicons-musical-note"
                :title="$t('pages.feed.emptyTitle')"
                :description="$t('pages.feed.emptyDescription')"
              />
            </template>
            <template v-else>
              <template v-if="artistLoading">
                <UiSkeletonFeed variant="artists" />
              </template>
              <template v-else-if="followedArtists.length > 0">
                <FeedArtistCarousel :artists="followedArtists">
                  <template #append>
                    <template v-if="artistLoadingMore">
                      <div
                        v-for="i in FEED_PAGE_SKELETON_COUNT"
                        :key="`artist-skel-${i}`"
                        class="flex flex-col items-center gap-3 p-3"
                      >
                        <USkeleton class="w-24 h-24 md:w-28 md:h-28 rounded-full" />
                        <USkeleton class="h-4 w-20" />
                      </div>
                    </template>
                  </template>
                </FeedArtistCarousel>
              </template>
              <UEmpty
                v-else
                icon="i-heroicons-users"
                :title="$t('pages.feed.emptyTitle')"
                :description="$t('pages.feed.emptyDescription')"
              />
            </template>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
