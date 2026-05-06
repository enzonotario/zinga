<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';

definePageMeta({
  name: 'debug-tidal',
  nameKey: 'pages.debugTidal.name',
  icon: 'lucide:bug',
  category: 'debug',
  descriptionKey: 'pages.debugTidal.description',
});
const { t } = useI18n();
const provider = useProvider();
const tidalAuth = useTidalAuth();
const loading = ref(false);
const response = ref<any>(null);
const error = ref<string | null>(null);
const endpoint = ref('searchAll');
const searchQuery = ref('Radiohead');
const artistId = ref('8803');
const albumId = ref('77723330');
const trackId = ref('77723340');
const countryCode = ref('US');
const cursor = ref('');
const currentToken = ref<string | null>(null);
const currentUser = ref<any>(null);
const nextCursor = ref<string | null>(null);
const showLoginModal = ref(false);
const PAGINATED_ENDPOINTS = ['albumsByArtist', 'favoriteAlbums', 'favoriteTracks', 'followedArtists'];
const loadToken = async () => {
  try {
    currentToken.value = await tidalAuth.getAccessToken();
  } catch {
    currentToken.value = null;
  }
};
const loadCurrentUser = async () => {
  try {
    currentUser.value = await tidalAuth.getCurrentUser();
  } catch {
    currentUser.value = null;
  }
};
onMounted(() => {
  loadToken();
  if (provider.isUserLoggedIn.value) {
    loadCurrentUser();
  }
});
watch(provider.isUserLoggedIn, (loggedIn) => {
  if (loggedIn) {
    loadToken();
    loadCurrentUser();
  } else {
    currentToken.value = null;
    currentUser.value = null;
  }
});
function clearTidalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes('tidal')) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
async function handleLogout() {
  provider.logout();
  clearTidalStorage();
  await provider.init(true);
  currentToken.value = null;
  currentUser.value = null;
  response.value = null;
  nextCursor.value = null;
  await loadToken();
}
function onLoginSuccess() {
  showLoginModal.value = false;
  loadToken();
  loadCurrentUser();
}
const endpointGroups = computed(() => [
  {
    labelKey: 'debug.groupSearch',
    items: [
      { label: t('debug.searchAll'), value: 'searchAll' },
      { label: t('debug.searchArtists'), value: 'searchArtists' },
      { label: t('debug.searchAlbums'), value: 'searchAlbums' },
      { label: t('debug.searchTracks'), value: 'searchTracks' },
    ],
  },
  {
    labelKey: 'debug.groupGet',
    items: [
      { label: t('debug.getArtist'), value: 'artist' },
      { label: t('debug.getAlbum'), value: 'album' },
      { label: t('debug.getTrack'), value: 'track' },
    ],
  },
  {
    labelKey: 'debug.groupRelated',
    items: [
      { label: t('debug.albumsByArtist'), value: 'albumsByArtist' },
      { label: t('debug.trackCredits'), value: 'trackCredits' },
      { label: t('debug.albumProviders'), value: 'albumProviders' },
      { label: t('debug.trackProviders'), value: 'trackProviders' },
    ],
  },
  {
    labelKey: 'debug.groupUser',
    items: [{ label: t('debug.currentUser'), value: 'currentUser' }],
  },
  {
    labelKey: 'debug.groupFavorites',
    items: [
      { label: t('debug.favoriteAlbums'), value: 'favoriteAlbums' },
      { label: t('debug.favoriteTracks'), value: 'favoriteTracks' },
      { label: t('debug.followedArtists'), value: 'followedArtists' },
    ],
  },
  {
    labelKey: 'debug.groupCheck',
    items: [
      { label: t('debug.isAlbumFavorite'), value: 'isAlbumFavorite' },
      { label: t('debug.isTrackFavorite'), value: 'isTrackFavorite' },
      { label: t('debug.isArtistFollowed'), value: 'isArtistFollowed' },
    ],
  },
]);
const needsSearch = computed(() => ['searchAll', 'searchArtists', 'searchAlbums', 'searchTracks'].includes(endpoint.value));
const needsArtistId = computed(() => ['artist', 'albumsByArtist', 'isArtistFollowed'].includes(endpoint.value));
const needsAlbumId = computed(() => ['album', 'albumProviders', 'isAlbumFavorite'].includes(endpoint.value));
const needsTrackId = computed(() => ['track', 'trackCredits', 'trackProviders', 'isTrackFavorite'].includes(endpoint.value));
const needsCountryCode = computed(() => endpoint.value !== 'currentUser');
const needsUserLogin = computed(() => ['currentUser', 'favoriteAlbums', 'favoriteTracks', 'followedArtists', 'isAlbumFavorite', 'isTrackFavorite', 'isArtistFollowed'].includes(endpoint.value));
const supportsCursor = computed(() => PAGINATED_ENDPOINTS.includes(endpoint.value));
function extractNextCursor(data: any): string | null {
  return data?.links?.meta?.nextCursor || null;
}
watch(endpoint, () => {
  cursor.value = '';
  nextCursor.value = null;
});
async function executeTest(useCursor?: string) {
  loading.value = true;
  error.value = null;
  response.value = null;
  nextCursor.value = null;
  const cursorValue = useCursor || cursor.value || undefined;
  try {
    const cc = countryCode.value;
    let result: any;
    switch (endpoint.value) {
    case 'searchAll':
      result = await tidalAuth.searchAll(searchQuery.value, 10, cc);
      break;
    case 'searchArtists':
      result = await tidalAuth.searchArtists(searchQuery.value, 20, 0, cc);
      break;
    case 'searchAlbums':
      result = await tidalAuth.searchAlbums(searchQuery.value, 20, 0, cc);
      break;
    case 'searchTracks':
      result = await tidalAuth.searchTracks(searchQuery.value, 20, 0, cc);
      break;
    case 'artist':
      result = await tidalAuth.getArtist(artistId.value, cc);
      break;
    case 'album':
      result = await tidalAuth.getAlbum(albumId.value, cc);
      break;
    case 'track':
      result = await tidalAuth.getTrack(trackId.value, cc);
      break;
    case 'albumsByArtist':
      result = await tidalAuth.getAlbumsByArtist(artistId.value, cc, undefined, cursorValue ?? '');
      break;
    case 'trackCredits':
      result = await tidalAuth.getTrackCredits(trackId.value, cc);
      break;
    case 'albumProviders':
      result = await tidalAuth.getAlbumProviders(albumId.value, cc);
      break;
    case 'trackProviders':
      result = await tidalAuth.getTrackProviders(trackId.value, cc);
      break;
    case 'currentUser':
      result = await tidalAuth.getCurrentUser();
      break;
    case 'favoriteAlbums':
      result = await tidalAuth.getFavoriteAlbums('en-US', cc, cursorValue);
      break;
    case 'favoriteTracks':
      result = await tidalAuth.getFavoriteTracks('en-US', cc, cursorValue);
      break;
    case 'followedArtists':
      result = await tidalAuth.getFollowedArtists('en-US', cc, cursorValue);
      break;
    case 'isAlbumFavorite':
      result = { isFavorite: await tidalAuth.isAlbumFavorite(albumId.value, 'en-US', cc) };
      break;
    case 'isTrackFavorite':
      result = { isFavorite: await tidalAuth.isTrackFavorite(trackId.value, 'en-US', cc) };
      break;
    case 'isArtistFollowed':
      result = { isFollowed: await tidalAuth.isArtistFollowed(artistId.value, 'en-US', cc) };
      break;
    }
    response.value = result;
    if (supportsCursor.value) {
      nextCursor.value = extractNextCursor(result);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('auth.unexpectedError');
    console.error('Debug test error:', err);
  } finally {
    loading.value = false;
  }
}
function loadNextPage() {
  if (!nextCursor.value) return;
  cursor.value = nextCursor.value;
  executeTest(nextCursor.value);
}
function resetPagination() {
  cursor.value = '';
  nextCursor.value = null;
}
const copyToken = async () => {
  if (currentToken.value) {
    await navigator.clipboard.writeText(currentToken.value);
  }
};
const copyResponse = async () => {
  if (response.value) {
    await navigator.clipboard.writeText(JSON.stringify(response.value, null, 2));
  }
};
function clearCache() {
  tidalAuth.clearCache();
  response.value = null;
  nextCursor.value = null;
}
const responseItemCount = computed(() => {
  if (!response.value) return null;
  const data = response.value?.data;
  if (Array.isArray(data)) return data.length;
  return null;
});
</script>

<template>
  <UContainer class="py-6 flex flex-col gap-6">
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">
          {{ t('pages.debugTidal.title') }}
        </h2>
      </template>
      <div class="space-y-6">
        {{ t('pages.debugTidal.fullDescription') }}
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            {{ t('debug.session') }}
          </h3>
          <UBadge
            :color="provider.isUserLoggedIn.value ? 'success' : 'neutral'"
            variant="subtle"
          >
            {{ provider.isUserLoggedIn.value ? t('auth.connected') : t('debug.notConnected') }}
          </UBadge>
        </div>
      </template>
      <div class="space-y-4">
        <div class="flex flex-wrap gap-6 text-sm">
          <div class="flex items-center gap-1">
            <span class="text-muted">{{ t('debug.initialized') }}:</span>
            <UBadge
              :color="provider.isInitialized.value ? 'success' : 'neutral'"
              variant="subtle"
              size="xs"
            >
              {{ provider.isInitialized.value ? t('common.yes') : t('common.no') }}
            </UBadge>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-muted">{{ t('debug.userLoggedIn') }}:</span>
            <UBadge
              :color="provider.isUserLoggedIn.value ? 'success' : 'warning'"
              variant="subtle"
              size="xs"
            >
              {{ provider.isUserLoggedIn.value ? t('common.yes') : t('common.no') }}
            </UBadge>
          </div>
        </div>
        <div v-if="currentUser" class="text-sm text-muted">
          {{ t('debug.userId') }}: <code>{{ currentUser?.data?.id }}</code>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!provider.isUserLoggedIn.value"
            icon="i-heroicons-arrow-right-end-on-rectangle"
            :loading="provider.isLoading.value"
            @click="showLoginModal = true"
          >
            {{ t('auth.login') }}
          </UButton>
          <UButton
            v-else
            icon="i-heroicons-arrow-right-on-rectangle"
            color="error"
            variant="soft"
            :loading="provider.isLoading.value"
            @click="handleLogout"
          >
            {{ t('auth.logout') }}
          </UButton>
          <UButton
            icon="i-heroicons-trash"
            variant="soft"
            @click="clearCache"
          >
            {{ t('debug.clearCache') }}
          </UButton>
        </div>
      </div>
    </UCard>
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            {{ t('debug.accessToken') }}
          </h3>
          <div class="flex gap-1">
            <UButton
              icon="i-heroicons-arrow-path"
              size="xs"
              variant="ghost"
              @click="loadToken"
            />
            <UButton
              v-if="currentToken"
              icon="i-heroicons-clipboard"
              size="xs"
              variant="ghost"
              @click="copyToken"
            />
          </div>
        </div>
      </template>
      <code class="block p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-xs break-all max-h-24 overflow-auto">
        {{ currentToken || t('debug.notAvailable') }}
      </code>
    </UCard>
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">
          {{ t('debug.endpointToTest') }}
        </h3>
      </template>
      <div class="space-y-4">
        <UFormField :label="t('debug.endpoint')">
          <div class="grid grid-cols-2 gap-x-6 gap-y-3">
            <div
              v-for="group in endpointGroups"
              :key="group.labelKey"
              class="flex min-w-0 flex-col gap-1.5"
            >
              <span class="text-xs font-medium text-muted">
                {{ t(group.labelKey) }}
              </span>
              <div class="flex min-w-0 flex-wrap gap-1.5">
                <UButton
                  v-for="item in group.items"
                  :key="item.value"
                  size="xs"
                  :variant="endpoint === item.value ? 'solid' : 'soft'"
                  @click="endpoint = item.value"
                >
                  {{ item.label }}
                </UButton>
              </div>
            </div>
          </div>
        </UFormField>
        <UAlert
          v-if="needsUserLogin && !provider.isUserLoggedIn.value"
          color="warning"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          :title="t('debug.requiresLogin')"
        />
        <div v-if="needsSearch">
          <UFormField :label="t('debug.searchQuery')">
            <UInput v-model="searchQuery" placeholder="Radiohead" />
          </UFormField>
        </div>
        <div v-if="needsArtistId">
          <UFormField :label="t('debug.artistId')">
            <UInput v-model="artistId" placeholder="8803" />
          </UFormField>
        </div>
        <div v-if="needsAlbumId">
          <UFormField :label="t('debug.albumId')">
            <UInput v-model="albumId" placeholder="77723330" />
          </UFormField>
        </div>
        <div v-if="needsTrackId">
          <UFormField :label="t('debug.trackId')">
            <UInput v-model="trackId" placeholder="77723340" />
          </UFormField>
        </div>
        <div v-if="needsCountryCode">
          <UFormField :label="t('debug.countryCode')">
            <UInput v-model="countryCode" placeholder="US" />
          </UFormField>
        </div>
        <div v-if="supportsCursor">
          <UFormField :label="t('debug.cursor')" :description="t('debug.cursorDescription')">
            <div class="flex gap-2">
              <UInput v-model="cursor" :placeholder="t('debug.cursorPlaceholder')" class="flex-1" />
              <UButton
                v-if="cursor"
                icon="i-heroicons-x-mark"
                variant="ghost"
                size="sm"
                @click="resetPagination"
              />
            </div>
          </UFormField>
        </div>
        <UButton
          block
          :loading="loading"
          :disabled="loading || !provider.isUserLoggedIn.value"
          @click="executeTest()"
        >
          {{ loading ? t('debug.testing') : t('debug.testEndpoint') }}
        </UButton>
      </div>
    </UCard>
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-circle"
      :title="t('common.error')"
      :description="error"
    />
    <UCard v-if="response">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold">
              {{ t('debug.response') }}
            </h3>
            <UBadge v-if="responseItemCount !== null" variant="subtle" size="xs">
              {{ responseItemCount }} {{ t('common.items') }}
            </UBadge>
          </div>
          <UButton
            icon="i-heroicons-clipboard"
            size="xs"
            variant="ghost"
            @click="copyResponse"
          >
            {{ t('debug.copyJson') }}
          </UButton>
        </div>
      </template>
      <div v-if="supportsCursor && (nextCursor || cursor)" class="flex items-center justify-between mb-4 p-3 bg-neutral-50 dark:bg-neutral-900 rounded">
        <div class="text-sm text-muted">
          <span v-if="cursor">{{ t('debug.currentCursor') }}: <code class="text-xs">{{ cursor.slice(0, 20) }}...</code></span>
          <span v-else>{{ t('debug.firstPage') }}</span>
        </div>
        <UButton
          v-if="nextCursor"
          icon="i-heroicons-chevron-right"
          trailing
          size="sm"
          variant="soft"
          @click="loadNextPage"
        >
          {{ t('debug.nextPage') }}
        </UButton>
        <span v-else class="text-sm text-muted">{{ t('debug.lastPage') }}</span>
      </div>
      <div class="p-3 bg-neutral-100 dark:bg-neutral-800 rounded overflow-auto max-h-128">
        <pre class="text-xs">{{ JSON.stringify(response, null, 2) }}</pre>
      </div>
    </UCard>
    <UModal v-model:open="showLoginModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ t('auth.loginTo', { provider: 'Tidal' }) }}
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
  </UContainer>
</template>
