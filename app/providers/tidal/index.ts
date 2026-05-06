import type {
  DeviceLoginInfo,
  MusicProvider,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedCredit,
  NormalizedSimilarArtist,
  NormalizedTrack,
  SearchResults,
} from '../types';
import * as auth from '@tidal-music/auth';
import { computed } from 'vue';
import {
  extractArtworkUrl,
  normalizeAlbum,
  normalizeArtist,
  normalizeCredit,
  normalizeSearchAlbum,
  normalizeSearchArtist,
  normalizeSearchTrack,
  normalizeSimilarArtist,
  normalizeTrack,
} from './normalizer';
import {
  checkAuth,
  clearCache as clearTidalCache,
  CLIENT_ID,
  CLIENT_SECRET,
  deviceLoginInfo,
  deviceLoginPending,
  error,
  getAPIClient,
  getCached,
  getCurrentUser,
  initAuth,
  isInitialized,
  isLoading,
  isUserLoggedIn,
  setCached,
  USER_SCOPES,
} from './service';
import { cursorParam } from './utils';

const ARTWORK_CACHE_PREFIX = 'tidal_img_';
const ARTWORK_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const albumCoverCache = new Map<string, string | null>();
const artistPictureCache = new Map<string, string | null>();
const pendingArtworkRequests = new Map<string, Promise<string | null>>();
function getFromPersistentArtworkCache(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(ARTWORK_CACHE_PREFIX + key);
    if (!cached) return null;
    const { url, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > ARTWORK_CACHE_TTL) {
      localStorage.removeItem(ARTWORK_CACHE_PREFIX + key);
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
function saveToPersistentArtworkCache(key: string, url: string | null): void {
  if (typeof window === 'undefined' || !url) return;
  try {
    localStorage.setItem(ARTWORK_CACHE_PREFIX + key, JSON.stringify({ url, timestamp: Date.now() }));
  } catch {}
}
async function artworkHrefFromApi(
  client: ReturnType<typeof getAPIClient>,
  artworkId: string,
  minWidth: number,
): Promise<string | undefined> {
  try {
    const res = await client.GET('/artworks/{id}', { params: { path: { id: artworkId } } });
    if (res.error || !res.data?.data?.attributes?.files?.length) return undefined;
    const files = res.data.data.attributes.files;
    const suitable = files.find((f: any) => Number(f.meta?.width) >= minWidth) || files[files.length - 1];
    return suitable?.href;
  } catch {
    return undefined;
  }
}
export function createTidalProvider(): MusicProvider {
  const provider: MusicProvider = {
    id: 'tidal',
    name: 'Tidal',
    isInitialized: computed(() => isInitialized.value),
    isUserLoggedIn: computed(() => isUserLoggedIn.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    deviceLoginPending: computed(() => deviceLoginPending.value),
    deviceLoginInfo: computed(() => deviceLoginInfo.value),
    async init(force = false) {
      await initAuth(force);
    },
    async startDeviceLogin(): Promise<DeviceLoginInfo> {
      try {
        isLoading.value = true;
        error.value = null;
        await auth.init({
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          credentialsStorageKey: 'tidal_credentials',
          scopes: USER_SCOPES,
        });
        isInitialized.value = true;
        deviceLoginPending.value = true;
        const response = await auth.initializeDeviceLogin();
        const info: DeviceLoginInfo = {
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          verificationUriComplete: response.verificationUriComplete,
          expiresIn: response.expiresIn,
        };
        deviceLoginInfo.value = info;
        return info;
      } catch (err: any) {
        error.value = err?.message || err?.cause?.message || JSON.stringify(err);
        deviceLoginPending.value = false;
        throw err;
      } finally {
        isLoading.value = false;
      }
    },
    async completeDeviceLogin(): Promise<boolean> {
      try {
        isLoading.value = true;
        error.value = null;
        await auth.finalizeDeviceLogin();
        deviceLoginPending.value = false;
        deviceLoginInfo.value = null;
        await checkAuth();
        return true;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Error completing login';
        deviceLoginPending.value = false;
        deviceLoginInfo.value = null;
        throw err;
      } finally {
        isLoading.value = false;
      }
    },
    cancelDeviceLogin() {
      deviceLoginPending.value = false;
      deviceLoginInfo.value = null;
      isLoading.value = false;
      error.value = null;
    },
    logout() {
      auth.logout();
      isUserLoggedIn.value = false;
      deviceLoginPending.value = false;
      deviceLoginInfo.value = null;
      isInitialized.value = false;
      clearTidalCache();
    },
    async searchAll(query: string, _limit = 10, countryCode = 'US'): Promise<SearchResults> {
      if (!isInitialized.value) await provider.init();
      const client = getAPIClient();
      const response = await client.GET('/searchResults/{id}', {
        params: {
          path: { id: query },
          query: { countryCode, include: ['artists', 'albums', 'tracks'] },
        },
      });
      if (response.error) throw new Error(`Search error: ${JSON.stringify(response.error)}`);
      const searchData = response.data;
      if (!searchData?.data) return { artists: [], albums: [], tracks: [] };
      const relationships = (searchData.data as any).relationships || {};
      const included = searchData.included || [];
      return {
        artists: (relationships.artists?.data || []).map((ref: any) =>
          normalizeSearchArtist(included.find((item: any) => item.type === 'artists' && item.id === ref.id) || ref, included),
        ),
        albums: (relationships.albums?.data || []).map((ref: any) =>
          normalizeSearchAlbum(included.find((item: any) => item.type === 'albums' && item.id === ref.id) || ref, included),
        ),
        tracks: (relationships.tracks?.data || []).map((ref: any) =>
          normalizeSearchTrack(included.find((item: any) => item.type === 'tracks' && item.id === ref.id) || ref, included),
        ),
      };
    },
    async getArtist(id: string, countryCode = 'US'): Promise<NormalizedArtist> {
      if (!isInitialized.value) await provider.init();
      const cacheKey = `artist:${id}:${countryCode}:normalized`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const response = await client.GET('/artists/{id}', {
        params: {
          path: { id },
          query: { countryCode, include: ['biography', 'profileArt', 'providers'] },
        },
      });
      if (response.error) {
        const err = new Error(`Error getting artist: ${JSON.stringify(response.error)}`) as any;
        if ((response.error as any).status) err.status = (response.error as any).status;
        throw err;
      }
      const normalized = normalizeArtist(response.data?.data, response.data?.included || []);
      setCached(cacheKey, normalized);
      return normalized;
    },
    async getArtistWithDetails(id: string, countryCode = 'US'): Promise<{
      artist: NormalizedArtist
      similarArtists: NormalizedSimilarArtist[]
    }> {
      if (!isInitialized.value) await provider.init();
      const cacheKey = `artistWithDetails:${id}:${countryCode}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const response = await client.GET('/artists/{id}', {
        params: {
          path: { id },
          query: { countryCode, include: ['biography', 'profileArt', 'providers', 'similarArtists'] },
        },
      });
      if (response.error) {
        const err = new Error(`Error getting artist: ${JSON.stringify(response.error)}`) as any;
        if ((response.error as any).status) err.status = (response.error as any).status;
        throw err;
      }
      const data = response.data?.data;
      const included = response.data?.included || [];
      const artist = normalizeArtist(data, included);
      const similarArtists = (data?.relationships?.similarArtists?.data || []).map((ref: any) => normalizeSimilarArtist(ref, included));
      const result = { artist, similarArtists };
      setCached(cacheKey, result);
      return result;
    },
    async getAlbum(id: string, countryCode = 'US'): Promise<NormalizedAlbum> {
      if (!isInitialized.value) await provider.init();
      const cacheKey = `album:${id}:${countryCode}:normalized`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const response = await client.GET('/albums/{id}', {
        params: {
          path: { id },
          query: { countryCode, include: ['artists', 'coverArt', 'genres', 'items', 'owners', 'providers', 'similarAlbums'] },
        },
      });
      if (response.error) throw new Error(`Error getting album: ${JSON.stringify(response.error)}`);
      const normalized = normalizeAlbum(response.data?.data, response.data?.included || []);
      setCached(cacheKey, normalized);
      return normalized;
    },
    async getAlbumTracks(id: string, countryCode = 'US'): Promise<NormalizedTrack[]> {
      if (!isInitialized.value) await provider.init();
      const cacheKey = `albumTracks:v2:${id}:${countryCode}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const itemsData: any[] = [];
      const includedTracks: any[] = [];
      let nextCursor: string | undefined;

      do {
        const response = await client.GET('/albums/{id}/relationships/items', {
          params: {
            path: { id },
            query: { countryCode, include: ['tracks'], ...cursorParam(nextCursor) },
          },
        });
        if (response.error) throw new Error(`Error getting album tracks: ${JSON.stringify(response.error)}`);
        itemsData.push(...(response.data?.data || []));
        includedTracks.push(...((response.data?.included || []).filter((item: any) => item.type === 'tracks')));
        nextCursor = (response.data?.links as any)?.meta?.nextCursor;
      } while (nextCursor);

      const tracksMap = new Map<string, any>();
      itemsData.forEach((item: any) => tracksMap.set(item.id, {
        id: item.id,
        meta: item.meta || {},
        attributes: item.attributes,
        relationships: item.relationships,
      }));
      includedTracks.forEach((track: any) => {
        const existing = tracksMap.get(track.id) || { id: track.id, meta: {} };
        tracksMap.set(track.id, { ...existing, attributes: track.attributes, relationships: track.relationships });
      });
      const missingTrackIds = Array.from(tracksMap.values())
        .filter((track: any) => !track.attributes?.title && !track.attributes?.name)
        .map((track: any) => track.id);

      if (missingTrackIds.length > 0) {
        const PARALLEL_REQUESTS = 8;
        for (let i = 0; i < missingTrackIds.length; i += PARALLEL_REQUESTS) {
          const batchIds = missingTrackIds.slice(i, i + PARALLEL_REQUESTS);
          const results = await Promise.all(batchIds.map((trackId) =>
            client.GET('/tracks/{id}', {
              params: { path: { id: trackId }, query: { countryCode, include: ['artists', 'albums'] } },
            }).then((res) => res.error || !res.data?.data ? null : res.data.data).catch(() => null),
          ));
          results.forEach((trackData) => {
            if (!trackData?.id) return;
            const existing = tracksMap.get(trackData.id) || { id: trackData.id, meta: {} };
            tracksMap.set(trackData.id, {
              ...existing,
              attributes: trackData.attributes || existing.attributes,
              relationships: trackData.relationships || existing.relationships,
            });
          });
        }
      }
      const tracks = Array.from(tracksMap.values())
        .map((t) => normalizeTrack(t, t.meta))
        .sort((a, b) => (a.volumeNumber || 1) !== (b.volumeNumber || 1) ? (a.volumeNumber || 1) - (b.volumeNumber || 1) : (a.trackNumber || 0) - (b.trackNumber || 0));
      setCached(cacheKey, tracks);
      return tracks;
    },
    async getAlbumsByArtist(id: string, countryCode = 'US'): Promise<NormalizedAlbum[]> {
      if (!isInitialized.value) await provider.init();
      const cacheKey = `albumsByArtist:${id}:${countryCode}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const allAlbumIds: string[] = [];
      let nextCursor: string | undefined;
      do {
        const response = await client.GET('/artists/{id}/relationships/albums', {
          params: { path: { id }, query: { countryCode, ...cursorParam(nextCursor) } },
        });
        if (response.error) throw new Error(`Error getting albums: ${JSON.stringify(response.error)}`);
        if (!response.data) break;
        (response.data.data || []).forEach((album: any) => allAlbumIds.push(album.id));
        nextCursor = (response.data.links as any)?.meta?.nextCursor;
      } while (nextCursor);
      if (allAlbumIds.length === 0) return [];
      const PARALLEL_REQUESTS = 5;
      const allAlbums: NormalizedAlbum[] = [];
      for (let i = 0; i < allAlbumIds.length; i += PARALLEL_REQUESTS) {
        const batchIds = allAlbumIds.slice(i, i + PARALLEL_REQUESTS);
        const results = await Promise.all(batchIds.map((albumId) =>
          client.GET('/albums/{id}', {
            params: { path: { id: albumId }, query: { countryCode, include: ['artists', 'coverArt', 'genres', 'providers'] } },
          }).then((res) => res.error || !res.data?.data ? null : normalizeAlbum(res.data.data, res.data.included || [])).catch(() => null),
        ));
        results.forEach((res) => res && allAlbums.push(res));
      }
      const sorted = allAlbums.sort((a, b) => {
        if (a.releaseDate && b.releaseDate) return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
        return a.releaseDate ? -1 : (b.releaseDate ? 1 : 0);
      });
      setCached(cacheKey, sorted);
      return sorted;
    },
    async getTrackCredits(id: string, countryCode = 'US'): Promise<NormalizedCredit[]> {
      if (!isInitialized.value) await provider.init();
      const client = getAPIClient() as any;
      const response = await client.GET('/tracks/{id}/relationships/credits', {
        params: { path: { id }, query: { countryCode, include: ['credits'] } },
      });
      if (response.error) throw new Error(`Error getting credits: ${JSON.stringify(response.error)}`);
      return (response.data?.included?.filter((item: any) => item.type === 'credits') || []).map(normalizeCredit);
    },
    async isAlbumFavorite(id: string, countryCode = 'US'): Promise<boolean> {
      try {
        const user = await getCurrentUser();
        const userId = user?.data?.id;
        if (!userId) return false;
        const client = getAPIClient();
        const response = await client.GET('/userCollections/{id}/relationships/albums', {
          params: { path: { id: userId }, query: { locale: 'en-US', countryCode, include: ['albums'] } },
        });
        return response.data?.data?.map((item: any) => item.id).includes(id) || false;
      } catch {
        return false;
      }
    },
    async addAlbumToFavorites(id: string, countryCode = 'US'): Promise<void> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.POST('/userCollections/{id}/relationships/albums', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id, type: 'albums' }] },
      });
      if (response.error) throw new Error(`Error adding album to favorites: ${JSON.stringify(response.error)}`);
      clearTidalCache();
    },
    async removeAlbumFromFavorites(id: string, countryCode = 'US'): Promise<void> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient() as any;
      const response = await client.DELETE('/userCollections/{id}/relationships/albums', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id, type: 'albums' }] },
      });
      if (response.error) throw new Error(`Error removing album from favorites: ${JSON.stringify(response.error)}`);
    },
    async isArtistFollowed(id: string, countryCode = 'US'): Promise<boolean> {
      try {
        const user = await getCurrentUser();
        const userId = user?.data?.id;
        if (!userId) return false;
        const client = getAPIClient();
        const response = await client.GET('/userCollections/{id}/relationships/artists', {
          params: { path: { id: userId }, query: { countryCode, locale: 'en-US' } },
        });
        return response.data?.data?.map((item: any) => item.id).includes(id) || false;
      } catch {
        return false;
      }
    },
    async followArtist(id: string, countryCode = 'US'): Promise<void> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.POST('/userCollections/{id}/relationships/artists', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id, type: 'artists' }] },
      });
      if (response.error) throw new Error(`Error following artist: ${JSON.stringify(response.error)}`);
      clearTidalCache();
    },
    async unfollowArtist(id: string, countryCode = 'US'): Promise<void> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient() as any;
      const response = await client.DELETE('/userCollections/{id}/relationships/artists', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id, type: 'artists' }] },
      });
      if (response.error) throw new Error(`Error unfollowing artist: ${JSON.stringify(response.error)}`);
    },
    async getFavoriteTrackIds(countryCode = 'US'): Promise<string[]> {
      try {
        const user = await getCurrentUser();
        const userId = user?.data?.id;
        if (!userId) return [];
        const client = getAPIClient();
        const response = await client.GET('/userCollections/{id}/relationships/tracks', {
          params: { path: { id: userId }, query: { locale: 'en-US', countryCode, include: ['tracks'] } },
        });
        return response.data?.data?.map((item: any) => item.id) || [];
      } catch {
        return [];
      }
    },
    async addTrackToFavorites(id: string, countryCode = 'US'): Promise<void> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.POST('/userCollections/{id}/relationships/tracks', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id, type: 'tracks' }] },
      });
      if (response.error) throw new Error(`Error adding track to favorites: ${JSON.stringify(response.error)}`);
    },
    async removeTrackFromFavorites(id: string, countryCode = 'US'): Promise<void> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient() as any;
      const response = await client.DELETE('/userCollections/{id}/relationships/tracks', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id, type: 'tracks' }] },
      });
      if (response.error) throw new Error(`Error removing track from favorites: ${JSON.stringify(response.error)}`);
    },
    async getFavoriteAlbums(countryCode = 'US', options?: { fetchAll?: boolean }): Promise<NormalizedAlbum[]> {
      if (!isInitialized.value) await provider.init();
      const fetchAll = options?.fetchAll ?? false;
      const cacheKey = `favoriteAlbums:${countryCode}:${fetchAll}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) return [];
      const client = getAPIClient();
      const albumMetas = new Map<string, { addedAt?: string }>();
      let nextCursor: string | undefined;
      do {
        const response = await client.GET('/userCollections/{id}/relationships/albums', {
          params: { path: { id: userId }, query: { locale: 'en-US', countryCode, include: ['albums'], ...cursorParam(nextCursor) } },
        });
        if (response.error) break;
        (response.data?.data || []).forEach((album: any) => albumMetas.set(album.id, { addedAt: (album as any).meta?.addedAt }));
        if (!fetchAll) break;
        nextCursor = (response.data?.links as any)?.meta?.nextCursor;
      } while (nextCursor);
      if (albumMetas.size === 0) return [];
      const allAlbumIds = Array.from(albumMetas.keys());
      const PARALLEL_REQUESTS = 5;
      const allAlbums: NormalizedAlbum[] = [];
      for (let i = 0; i < allAlbumIds.length; i += PARALLEL_REQUESTS) {
        const batchIds = allAlbumIds.slice(i, i + PARALLEL_REQUESTS);
        const results = await Promise.all(batchIds.map((albumId) =>
          client.GET('/albums/{id}', {
            params: { path: { id: albumId }, query: { countryCode, include: ['artists', 'coverArt', 'genres', 'providers'] } },
          }).then((res) => res.error || !res.data?.data ? null : normalizeAlbum(res.data.data, res.data.included || [], albumMetas.get(albumId))).catch(() => null),
        ));
        results.forEach((res) => res && allAlbums.push(res));
      }
      setCached(cacheKey, allAlbums);
      return allAlbums;
    },
    async getFavoriteAlbumsPage(countryCode = 'US', cursor?: string): Promise<{ items: NormalizedAlbum[], nextCursor: string | null }> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) return { items: [], nextCursor: null };
      const client = getAPIClient();
      const response = await client.GET('/userCollections/{id}/relationships/albums', {
        params: { path: { id: userId }, query: { locale: 'en-US', countryCode, include: ['albums'], ...cursorParam(cursor) } },
      });
      if (response.error || !response.data?.data) return { items: [], nextCursor: null };
      const albumMetas = new Map<string, { addedAt?: string }>();
      response.data.data.forEach((album: any) => albumMetas.set(album.id, { addedAt: (album as any).meta?.addedAt }));
      const nextCursor = (response.data?.links as any)?.meta?.nextCursor ?? null;
      if (albumMetas.size === 0) return { items: [], nextCursor };
      const items: NormalizedAlbum[] = [];
      const albumIds = Array.from(albumMetas.keys());
      const PARALLEL_REQUESTS = 5;
      for (let i = 0; i < albumIds.length; i += PARALLEL_REQUESTS) {
        const batchIds = albumIds.slice(i, i + PARALLEL_REQUESTS);
        const results = await Promise.all(batchIds.map((albumId) =>
          client.GET('/albums/{id}', {
            params: { path: { id: albumId }, query: { countryCode, include: ['artists', 'coverArt', 'genres', 'providers'] } },
          }).then((res) => res.error || !res.data?.data ? null : normalizeAlbum(res.data.data, res.data.included || [], albumMetas.get(albumId))).catch(() => null),
        ));
        results.forEach((res) => res && items.push(res));
      }
      return { items, nextCursor };
    },
    async getFollowedArtists(countryCode = 'US', options?: { fetchAll?: boolean }): Promise<NormalizedArtist[]> {
      if (!isInitialized.value) await provider.init();
      const fetchAll = options?.fetchAll ?? false;
      const cacheKey = `followedArtists:${countryCode}:${fetchAll}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) return [];
      const client = getAPIClient();
      const artistMetas = new Map<string, { addedAt?: string }>();
      let nextCursor: string | undefined;
      do {
        const response = await client.GET('/userCollections/{id}/relationships/artists', {
          params: { path: { id: userId }, query: { locale: 'en-US', countryCode, ...cursorParam(nextCursor) } },
        });
        if (response.error) break;
        (response.data?.data || []).forEach((artist: any) => artistMetas.set(artist.id, { addedAt: (artist as any).meta?.addedAt }));
        if (!fetchAll) break;
        nextCursor = (response.data?.links as any)?.meta?.nextCursor;
      } while (nextCursor);
      if (artistMetas.size === 0) return [];
      const allArtistIds = Array.from(artistMetas.keys());
      const PARALLEL_REQUESTS = 5;
      const allArtists: NormalizedArtist[] = [];
      for (let i = 0; i < allArtistIds.length; i += PARALLEL_REQUESTS) {
        const batchIds = allArtistIds.slice(i, i + PARALLEL_REQUESTS);
        const results = await Promise.all(batchIds.map((artistId) =>
          client.GET('/artists/{id}', {
            params: { path: { id: artistId }, query: { countryCode, include: ['profileArt'] } },
          }).then((res) => res.error || !res.data?.data ? null : normalizeArtist(res.data.data, res.data.included || [], artistMetas.get(artistId))).catch(() => null),
        ));
        results.forEach((res) => res && allArtists.push(res));
      }
      setCached(cacheKey, allArtists);
      return allArtists;
    },
    async getFollowedArtistsPage(countryCode = 'US', cursor?: string): Promise<{ items: NormalizedArtist[], nextCursor: string | null }> {
      if (!isInitialized.value) await provider.init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) return { items: [], nextCursor: null };
      const client = getAPIClient();
      const response = await client.GET('/userCollections/{id}/relationships/artists', {
        params: { path: { id: userId }, query: { locale: 'en-US', countryCode, ...cursorParam(cursor) } },
      });
      if (response.error || !response.data?.data) return { items: [], nextCursor: null };
      const artistMetas = new Map<string, { addedAt?: string }>();
      response.data.data.forEach((artist: any) => artistMetas.set(artist.id, { addedAt: (artist as any).meta?.addedAt }));
      const nextCursor = (response.data?.links as any)?.meta?.nextCursor ?? null;
      if (artistMetas.size === 0) return { items: [], nextCursor };
      const items: NormalizedArtist[] = [];
      const artistIds = Array.from(artistMetas.keys());
      const PARALLEL_REQUESTS = 5;
      for (let i = 0; i < artistIds.length; i += PARALLEL_REQUESTS) {
        const batchIds = artistIds.slice(i, i + PARALLEL_REQUESTS);
        const results = await Promise.all(batchIds.map((artistId) =>
          client.GET('/artists/{id}', {
            params: { path: { id: artistId }, query: { countryCode, include: ['profileArt'] } },
          }).then((res) => res.error || !res.data?.data ? null : normalizeArtist(res.data.data, res.data.included || [], artistMetas.get(artistId))).catch(() => null),
        ));
        results.forEach((res) => res && items.push(res));
      }
      return { items, nextCursor };
    },
    async getArtistPicture(id: string, countryCode = 'US', minWidth = 640): Promise<string | null> {
      const cacheKey = `artist:${id}:${minWidth}`;
      if (artistPictureCache.has(cacheKey)) return artistPictureCache.get(cacheKey) || null;
      const persistedUrl = getFromPersistentArtworkCache(cacheKey);
      if (persistedUrl) {
        artistPictureCache.set(cacheKey, persistedUrl);
        return persistedUrl;
      }
      if (pendingArtworkRequests.has(cacheKey)) return pendingArtworkRequests.get(cacheKey)!;
      const requestPromise = (async () => {
        try {
          if (!isInitialized.value) await provider.init();
          const client = getAPIClient();
          const response = await client.GET('/artists/{id}', {
            params: { path: { id }, query: { countryCode, include: ['profileArt'] } },
          });
          if (response.error || !response.data?.data) {
            artistPictureCache.set(cacheKey, null);
            return null;
          }
          const url = extractArtworkUrl(response.data.data, response.data.included || [], 'profileArt', minWidth);
          artistPictureCache.set(cacheKey, url || null);
          saveToPersistentArtworkCache(cacheKey, url || null);
          return url || null;
        } catch (error: unknown) {
          const err = error as { status?: number, message?: string };
          if (err?.status !== undefined) {
            const e = new Error('Tidal API error');
            Object.assign(e, { status: err.status });
            throw e;
          }
          if (typeof err?.message === 'string' && (err.message.includes('429') || err.message.includes('rate limit'))) {
            const e = new Error('Rate limited');
            Object.assign(e, { status: 429 });
            throw e;
          }
          throw error instanceof Error ? error : new Error(String(error));
        } finally {
          pendingArtworkRequests.delete(cacheKey);
        }
      })();
      pendingArtworkRequests.set(cacheKey, requestPromise);
      return requestPromise;
    },
    async getAlbumCover(id: string, countryCode = 'US', minWidth = 640): Promise<string | null> {
      const cacheKey = `album:${id}:${minWidth}`;
      if (albumCoverCache.has(cacheKey)) return albumCoverCache.get(cacheKey) || null;
      const persistedUrl = getFromPersistentArtworkCache(cacheKey);
      if (persistedUrl) {
        albumCoverCache.set(cacheKey, persistedUrl);
        return persistedUrl;
      }
      if (pendingArtworkRequests.has(cacheKey)) return pendingArtworkRequests.get(cacheKey)!;
      const requestPromise = (async () => {
        try {
          if (!isInitialized.value) await provider.init();
          const client = getAPIClient();
          const response = await client.GET('/albums/{id}', {
            params: { path: { id }, query: { countryCode, include: ['coverArt'] } },
          });
          if (response.error || !response.data?.data) {
            albumCoverCache.set(cacheKey, null);
            return null;
          }
          let url = extractArtworkUrl(response.data.data, response.data.included || [], 'coverArt', minWidth);
          if (!url) {
            const refId = response.data.data?.relationships?.coverArt?.data?.[0]?.id;
            if (refId) url = await artworkHrefFromApi(client, refId, minWidth);
          }
          albumCoverCache.set(cacheKey, url || null);
          saveToPersistentArtworkCache(cacheKey, url || null);
          return url || null;
        } catch {
          return null;
        } finally {
          pendingArtworkRequests.delete(cacheKey);
        }
      })();
      pendingArtworkRequests.set(cacheKey, requestPromise);
      return requestPromise;
    },
    async getAlbumProviders(id: string, countryCode = 'US'): Promise<any> {
      if (!isInitialized.value) await provider.init();
      const client = getAPIClient();
      const response = await client.GET('/albums/{id}/relationships/providers', {
        params: { path: { id }, query: { countryCode, include: ['providers'] } },
      });
      if (response.error) throw new Error(`Error getting album providers: ${JSON.stringify(response.error)}`);
      return response.data;
    },
    clearCache() {
      clearTidalCache();
      albumCoverCache.clear();
      artistPictureCache.clear();
    },
  };
  return provider;
}
const tidalProvider = createTidalProvider();
export function getTidalProvider(): MusicProvider {
  return tidalProvider;
}
export default tidalProvider;
