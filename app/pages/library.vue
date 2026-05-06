<script lang="ts" setup>
import type { TableColumn } from '@nuxt/ui';
import type { NormalizedAlbum, NormalizedArtist } from '~/providers/types';
import { h, nextTick, onActivated, onDeactivated, resolveComponent } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

definePageMeta({
  name: 'library',
  nameKey: 'pages.library.name',
  icon: 'lucide:library',
  category: 'main',
  descriptionKey: 'pages.library.description',
  keepalive: true,
});
const UBadge = resolveComponent('UBadge');
const UButton = resolveComponent('UButton');
const UIcon = resolveComponent('UIcon');
const { t } = useI18n();
type ViewMode = 'albums' | 'artists' | 'local';
const localDb = useLocalDb();
const feedSync = useFeedSync();
const loading = ref(true);
const albums = useState<NormalizedAlbum[]>('library-albums', () => []);
const artists = useState<NormalizedArtist[]>('library-artists', () => []);
const hasLoaded = useState('library-loaded', () => false);
const scrollY = useState('library-scroll', () => 0);
const viewMode = useState<ViewMode>('library-view-mode', () => 'albums');
const search = useState('library-search', () => '');
const albumSorting = useState<{ id: string, desc: boolean }[]>('library-album-sorting', () => [
  { id: 'releaseDate', desc: true },
]);
const artistSorting = useState<{ id: string, desc: boolean }[]>('library-artist-sorting', () => [
  { id: 'name', desc: false },
]);
const typeFilter = useState<string | null>('library-type-filter', () => null);
const genreFilter = useState<string | null>('library-genre-filter', () => null);
function sortingHeader(label: string, _columnId: string, _sortingRef: Ref<{ id: string, desc: boolean }[]>) {
  return ({ column }: any) => {
    const isSorted = column.getIsSorted();
    return h(UButton, {
      variant: 'ghost',
      label,
      icon: isSorted
        ? isSorted === 'asc'
          ? 'i-lucide-arrow-up-narrow-wide'
          : 'i-lucide-arrow-down-wide-narrow'
        : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
    });
  };
}
const albumColumns = computed<TableColumn<NormalizedAlbum>[]>(() => [
  {
    accessorKey: 'title',
    header: sortingHeader(t('pages.library.colTitle'), 'title', albumSorting),
    cell: ({ row }) => {
      const title = row.getValue('title') as string;
      const explicit = row.original.explicit;
      const coverUrl = row.original.coverUrl;
      const cover = coverUrl
        ? h('img', {
          src: coverUrl,
          alt: title,
          class: 'w-10 h-10 rounded object-cover shrink-0',
        })
        : h('div', {
          class: 'w-10 h-10 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0',
        }, [h(UIcon, { name: 'i-heroicons-musical-note', class: 'w-5 h-5 text-neutral-400' })]);
      return h('div', { class: 'flex items-center gap-3 min-w-0' }, [
        cover,
        h('div', { class: 'flex flex-col min-w-0' }, [
          h('span', { class: 'font-medium truncate max-w-xs' }, title),
          explicit ? h('span', { class: 'text-xs text-neutral-500' }, t('album.explicit')) : null,
        ]),
      ]);
    },
  },
  {
    id: 'artists',
    header: t('pages.library.colArtist'),
    cell: ({ row }) => {
      const artists = row.original.artists;
      return h('span', { class: 'truncate max-w-xs text-neutral-500' }, artists.map((a) => a.name).join(', '));
    },
  },
  {
    accessorKey: 'releaseDate',
    header: sortingHeader(t('pages.library.colDate'), 'releaseDate', albumSorting),
    cell: ({ row }) => {
      const date = row.getValue('releaseDate') as string | undefined;
      if (!date) return h('span', { class: 'text-neutral-500' }, '-');
      const formatted = new Date(date).toISOString().split('T')[0];
      return h('span', { class: 'text-neutral-500' }, formatted);
    },
  },
  {
    accessorKey: 'type',
    header: sortingHeader(t('pages.library.type'), 'type', albumSorting),
    cell: ({ row }) => {
      const type = row.getValue('type') as string | undefined;
      if (!type) return null;
      return h(UBadge, { variant: 'subtle', size: 'xs' }, () => t(`album.types.${type}`) || type);
    },
  },
  {
    accessorKey: 'numberOfTracks',
    header: sortingHeader(t('pages.library.colTracks'), 'numberOfTracks', albumSorting),
    cell: ({ row }) => {
      const tracks = row.getValue('numberOfTracks') as number | undefined;
      return h('span', { class: 'text-neutral-500' }, tracks?.toString() || '-');
    },
  },
  {
    accessorKey: 'duration',
    header: sortingHeader(t('pages.library.colDuration'), 'duration', albumSorting),
    cell: ({ row }) => {
      const duration = row.getValue('duration') as number | undefined;
      if (!duration) return h('span', { class: 'text-neutral-500' }, '-');
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const formatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      return h('span', { class: 'text-neutral-500' }, formatted);
    },
  },
  {
    accessorKey: 'addedAt',
    header: sortingHeader(t('pages.library.colAdded'), 'addedAt', albumSorting),
    cell: ({ row }) => {
      const addedAt = row.getValue('addedAt') as string | undefined;
      if (!addedAt) return h('span', { class: 'text-neutral-500' }, '-');
      const formatted = new Date(addedAt).toISOString().split('T')[0];
      return h('span', { class: 'text-neutral-500' }, formatted);
    },
  },
]);
const artistColumns = computed<TableColumn<NormalizedArtist>[]>(() => [
  {
    accessorKey: 'name',
    header: sortingHeader(t('pages.library.colName'), 'name', artistSorting),
    cell: ({ row }) => {
      const name = row.getValue('name') as string;
      const picture = row.original.picture;
      const avatar = picture
        ? h('img', {
          src: picture,
          alt: name,
          class: 'w-10 h-10 rounded-full object-cover shrink-0',
        })
        : h('div', {
          class: 'w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0',
        }, [h(UIcon, { name: 'i-heroicons-user', class: 'w-5 h-5 text-neutral-400' })]);
      return h('div', { class: 'flex items-center gap-3 min-w-0' }, [
        avatar,
        h('span', { class: 'font-medium truncate' }, name),
      ]);
    },
  },
  {
    accessorKey: 'addedAt',
    header: sortingHeader(t('pages.library.colFollowed'), 'addedAt', artistSorting),
    cell: ({ row }) => {
      const addedAt = row.getValue('addedAt') as string | undefined;
      if (!addedAt) return h('span', { class: 'text-neutral-500' }, '-');
      const formatted = new Date(addedAt).toISOString().split('T')[0];
      return h('span', { class: 'text-neutral-500' }, formatted);
    },
  },
]);
const availableTypes = computed(() => {
  const types = new Set(albums.value.map((a) => a.type).filter(Boolean));
  return Array.from(types).map((type) => ({
    label: t(`album.types.${type}`) || type as string,
    value: type as string,
  }));
});
const availableGenres = computed(() => {
  const genreSet = new Set<string>();
  albums.value.forEach((album) => {
    album.genres?.forEach((g) => genreSet.add(g));
  });
  return Array.from(genreSet).sort().map((genre) => ({
    label: genre,
    value: genre,
  }));
});
const filteredAlbums = computed(() => {
  let result = [...albums.value];
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter((album) =>
      album.title.toLowerCase().includes(q)
      || album.artists.some((a) => a.name.toLowerCase().includes(q)),
    );
  }
  if (typeFilter.value) {
    result = result.filter((album) => album.type === typeFilter.value);
  }
  if (genreFilter.value) {
    result = result.filter((album) => album.genres?.includes(genreFilter.value!));
  }
  return result;
});
const filteredArtists = computed(() => {
  let result = [...artists.value];
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter((artist) =>
      artist.name.toLowerCase().includes(q),
    );
  }
  return result;
});
function clearFilters() {
  search.value = '';
  typeFilter.value = null;
  genreFilter.value = null;
}
const hasActiveFilters = computed(() => {
  return search.value || typeFilter.value || genreFilter.value;
});
async function loadData() {
  loading.value = true;
  try {
    const [albumsData, artistsData] = await Promise.all([
      localDb.getAlbums(),
      localDb.getArtists(),
    ]);
    albums.value = albumsData;
    artists.value = artistsData;
    hasLoaded.value = true;
  } catch (err) {
    console.error('Error cargando datos locales:', err);
  } finally {
    loading.value = false;
  }
}
async function handleSync() {
  try {
    await feedSync.syncAll();
    await loadData();
  } catch (err) {
    console.error('Error sincronizando:', err);
  }
}
watch(feedSync.isSyncing, (isSyncing, wasSyncing) => {
  if (wasSyncing && !isSyncing && feedSync.progress.value.phase === 'done') {
    loadData();
  }
});
function handleAlbumSelect(_e: Event, row: { original: NormalizedAlbum }) {
  navigateTo(`/album/${row.original.id}`);
}
function handleArtistSelect(_e: Event, row: { original: NormalizedArtist }) {
  navigateTo(`/artist/${row.original.id}`);
}
function getScrollContainer() {
  if (!import.meta.client) return null;
  return document.getElementById('app-scroll');
}
function restoreScroll() {
  const container = getScrollContainer();
  if (!container) return;
  nextTick(() => {
    container.scrollTop = scrollY.value;
  });
}
function storeScroll() {
  const container = getScrollContainer();
  if (!container) return;
  scrollY.value = container.scrollTop;
}
onMounted(() => {
  if (hasLoaded.value) {
    loading.value = false;
  } else {
    loadData();
  }
  restoreScroll();
});
onActivated(() => {
  restoreScroll();
});
onDeactivated(() => {
  storeScroll();
});
onBeforeRouteLeave(() => {
  storeScroll();
});
</script>

<template>
  <div class="min-h-full py-8">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col">
            <h2 class="text-lg font-medium">
              {{ t('pages.library.title') }}
            </h2>
            <span class="text-sm text-(--ui-text-muted)">
              {{ t('pages.library.albumCount', { count: albums.length, artistCount: artists.length }) }}
            </span>
          </div>
          <div class="flex items-start gap-2">
            <UButton
              :label="feedSync.isSyncing.value ? t('pages.feed.syncing') : t('pages.feed.sync')"
              :loading="feedSync.isSyncing.value"
              :disabled="feedSync.isSyncing.value"
              icon="i-heroicons-arrow-path"
              variant="ghost"
              class="mt-1"
              @click="handleSync"
            />
            <UTabs
              v-model="viewMode"
              :items="[
                { label: t('pages.library.albums'), value: 'albums', icon: 'i-heroicons-square-3-stack-3d' },
                { label: t('pages.library.artists'), value: 'artists', icon: 'i-heroicons-users' },
                { label: t('common.local'), value: 'local', icon: 'i-heroicons-folder' },
              ]"
            />
          </div>
        </div>
      </template>
      <div class="flex flex-col gap-2">
        <LibraryLocalSection v-if="viewMode === 'local'" />
        <template v-else>
          <div class="flex flex-col md:flex-row gap-3">
            <UInput
              v-model="search"
              :placeholder="viewMode === 'albums' ? t('pages.library.searchAlbumPlaceholder') : t('pages.library.searchArtistPlaceholder')"
              icon="i-heroicons-magnifying-glass"
              class="flex-1"
            />
            <template v-if="viewMode === 'albums'">
              <USelectMenu
                v-model="typeFilter"
                :items="availableTypes"
                :placeholder="t('pages.library.type')"
                value-key="value"
                class="w-full md:w-40"
              />
              <USelectMenu
                v-model="genreFilter"
                :items="availableGenres"
                :placeholder="t('pages.library.genre')"
                value-key="value"
                searchable
                class="w-full md:w-48"
              />
            </template>
            <UButton
              v-if="hasActiveFilters"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="clearFilters"
            >
              {{ t('common.clear') }}
            </UButton>
          </div>
          <div
            v-if="feedSync.isSyncing.value"
            class="flex flex-col gap-1.5 py-2"
          >
            <div class="flex justify-between text-xs text-(--ui-text-muted) px-1">
              <span class="truncate max-w-[70%]">{{ feedSync.progress.value.message }}</span>
              <span v-if="feedSync.progress.value.page" class="font-medium">
                {{ t('pages.library.pageProgress', { page: feedSync.progress.value.page }) }}
              </span>
            </div>
            <UProgress
              :value="feedSync.progress.value.total > 0 ? feedSync.progress.value.current : undefined"
              :max="feedSync.progress.value.total > 0 ? feedSync.progress.value.total : undefined"
              size="sm"
              color="primary"
            />
          </div>
          <template v-if="loading">
            <UiSkeletonTable
              :columns="viewMode === 'albums' ? 8 : 3"
              :rows="10"
              :ui="{ td: 'py-2', th: 'py-3', tr: '' }"
            />
          </template>
          <template v-else-if="viewMode === 'albums'">
            <UTable
              v-if="filteredAlbums.length > 0"
              v-model:sorting="albumSorting"
              :data="filteredAlbums"
              :columns="albumColumns"
              :ui="{ td: 'py-2', th: 'py-3', tr: 'cursor-pointer hover:bg-elevated/50' }"
              @select="handleAlbumSelect"
            />
            <UEmpty
              v-else
              icon="i-heroicons-musical-note"
              :title="hasActiveFilters ? t('pages.library.noResults') : t('pages.library.noAlbums')"
              :description="hasActiveFilters ? t('pages.library.tryOtherFilters') : t('pages.library.syncFromFeed')"
            >
              <template v-if="hasActiveFilters" #actions>
                <UButton variant="soft" @click="clearFilters">
                  {{ t('common.clearFilters') }}
                </UButton>
              </template>
            </UEmpty>
          </template>
          <template v-else>
            <UTable
              v-if="filteredArtists.length > 0"
              v-model:sorting="artistSorting"
              :data="filteredArtists"
              :columns="artistColumns"
              :ui="{ td: 'py-2', th: 'py-3', tr: 'cursor-pointer hover:bg-elevated/50' }"
              @select="handleArtistSelect"
            />
            <UEmpty
              v-else
              icon="i-heroicons-users"
              :title="hasActiveFilters ? t('pages.library.noResults') : t('pages.library.noArtists')"
              :description="hasActiveFilters ? t('pages.library.tryOtherSearch') : t('pages.library.syncFromFeed')"
            >
              <template v-if="hasActiveFilters" #actions>
                <UButton variant="soft" @click="clearFilters">
                  {{ t('common.clearFilters') }}
                </UButton>
              </template>
            </UEmpty>
          </template>
        </template>
      </div>
    </UCard>
  </div>
</template>
