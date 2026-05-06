import type { NormalizedAlbum, NormalizedArtist } from '~/providers/types';

interface SyncProgress {
  phase: 'idle' | 'albums' | 'artists' | 'done' | 'error'
  current: number
  total: number
  message: string
  page?: number
}
const isSyncing = ref(false);
const progress = ref<SyncProgress>({
  phase: 'idle',
  current: 0,
  total: 0,
  message: '',
  page: 0,
});
const lastSyncAlbums = ref<Date | null>(null);
const lastSyncArtists = ref<Date | null>(null);
const SYNC_COUNTRY = 'US';

export default function useFeedSync() {
  const { t } = useI18n();
  const provider = useProvider();
  const localDb = useLocalDb();
  async function albumWithCoverIfNeeded(album: NormalizedAlbum): Promise<NormalizedAlbum> {
    if (album.coverUrl || provider.providerId !== 'tidal') return album;
    const coverUrl = await provider.getAlbumCover(album.id, SYNC_COUNTRY, 640);
    if (!coverUrl) return album;
    return { ...album, coverUrl };
  }
  async function loadLastSyncTimes() {
    const albumSync = await localDb.getLastSync('albums');
    const artistSync = await localDb.getLastSync('artists');
    if (albumSync?.completed_at) {
      lastSyncAlbums.value = new Date(albumSync.completed_at);
    }
    if (artistSync?.completed_at) {
      lastSyncArtists.value = new Date(artistSync.completed_at);
    }
  }
  async function syncAlbums(): Promise<number> {
    progress.value = {
      phase: 'albums',
      current: 0,
      total: 0,
      message: t('sync.fetchingFavoriteAlbums'),
      page: 1,
    };
    const syncId = await localDb.startSyncHistory('albums');
    let syncedCount = 0;
    let nextCursor: string | null = null;
    let currentPage = 1;
    try {
      do {
        progress.value.message = t('sync.fetchingAlbumPage', { page: currentPage });
        progress.value.page = currentPage;
        const result = await provider.getFavoriteAlbumsPage('US', nextCursor || undefined);
        const albums = result.items;
        for (let i = 0; i < albums.length; i++) {
          const album = albums[i];
          progress.value.current = syncedCount + i + 1;
          progress.value.message = t('sync.syncingAlbum', { count: syncedCount + i + 1, title: album.title });
          await localDb.saveAlbum(await albumWithCoverIfNeeded(album));
        }
        syncedCount += albums.length;
        nextCursor = result.nextCursor;
        currentPage++;
      } while (nextCursor);
      await localDb.completeSyncHistory(syncId, syncedCount, 'completed');
      lastSyncAlbums.value = new Date();
      return syncedCount;
    } catch (err) {
      await localDb.completeSyncHistory(syncId, syncedCount, 'error');
      throw err;
    }
  }
  async function syncArtists(): Promise<number> {
    progress.value = {
      phase: 'artists',
      current: 0,
      total: 0,
      message: t('sync.fetchingFollowedArtists'),
      page: 1,
    };
    const syncId = await localDb.startSyncHistory('artists');
    let syncedCount = 0;
    let nextCursor: string | null = null;
    let currentPage = 1;
    try {
      do {
        progress.value.message = t('sync.fetchingArtistPage', { page: currentPage });
        progress.value.page = currentPage;
        const result = await provider.getFollowedArtistsPage('US', nextCursor || undefined);
        const artists = result.items;
        for (let i = 0; i < artists.length; i++) {
          const artist = artists[i];
          progress.value.current = syncedCount + i + 1;
          progress.value.message = t('sync.syncingArtist', { count: syncedCount + i + 1, name: artist.name });
          await localDb.saveArtist(artist);
        }
        syncedCount += artists.length;
        nextCursor = result.nextCursor;
        currentPage++;
      } while (nextCursor);
      await localDb.completeSyncHistory(syncId, syncedCount, 'completed');
      lastSyncArtists.value = new Date();
      return syncedCount;
    } catch (err) {
      await localDb.completeSyncHistory(syncId, syncedCount, 'error');
      throw err;
    }
  }
  async function syncAll(): Promise<{ albums: number, artists: number }> {
    if (isSyncing.value) {
      throw new Error(t('sync.alreadyInProgress'));
    }
    isSyncing.value = true;
    progress.value = {
      phase: 'albums',
      current: 0,
      total: 0,
      message: t('sync.startingSync'),
    };
    provider.clearCache();
    await localDb.clearAllData();
    try {
      const albumsCount = await syncAlbums();
      const artistsCount = await syncArtists();
      progress.value = {
        phase: 'done',
        current: albumsCount + artistsCount,
        total: albumsCount + artistsCount,
        message: t('sync.completed', { albums: albumsCount, artists: artistsCount }),
      };
      return { albums: albumsCount, artists: artistsCount };
    } catch (err) {
      progress.value = {
        phase: 'error',
        current: 0,
        total: 0,
        message: err instanceof Error ? err.message : t('sync.syncError'),
      };
      throw err;
    } finally {
      isSyncing.value = false;
    }
  }
  async function getLocalAlbums(): Promise<NormalizedAlbum[]> {
    return await localDb.getAlbums();
  }
  async function getLocalArtists(): Promise<NormalizedArtist[]> {
    return await localDb.getArtists();
  }
  async function getLocalStats() {
    return await localDb.getStats();
  }
  onMounted(() => {
    loadLastSyncTimes();
  });
  return {
    isSyncing,
    progress,
    lastSyncAlbums,
    lastSyncArtists,
    syncAll,
    syncAlbums,
    syncArtists,
    getLocalAlbums,
    getLocalArtists,
    getLocalStats,
    loadLastSyncTimes,
  };
}
