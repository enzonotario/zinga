import * as auth from '@tidal-music/auth';
import { computed } from 'vue';
import {
  checkAuth,
  clearCache,
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
} from '~/providers/tidal/service';
import { cursorParam } from '~/providers/tidal/utils';
import useRemoteClient from './useRemoteClient';

export default function useTidalAuth() {
  const { t } = useI18n();
  const init = async (force = false) => {
    const remote = useRemoteClient();
    if (remote.isRemoteMode.value) {
      isInitialized.value = true;
      isUserLoggedIn.value = true;
      return;
    }
    await initAuth(force);
  };
  const startDeviceLogin = async () => {
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
      deviceLoginInfo.value = {
        userCode: response.userCode,
        verificationUri: response.verificationUri,
        verificationUriComplete: response.verificationUriComplete,
        expiresIn: response.expiresIn,
      };
      return deviceLoginInfo.value;
    } catch (err: any) {
      error.value = err?.message || err?.cause?.message || JSON.stringify(err);
      deviceLoginPending.value = false;
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  const completeDeviceLogin = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      await auth.finalizeDeviceLogin();
      deviceLoginPending.value = false;
      deviceLoginInfo.value = null;
      await checkAuth();
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : t('auth.errorCompletingLogin');
      deviceLoginPending.value = false;
      deviceLoginInfo.value = null;
      throw err;
    } finally {
      isLoading.value = false;
    }
  };
  const cancelDeviceLogin = () => {
    deviceLoginPending.value = false;
    deviceLoginInfo.value = null;
    isLoading.value = false;
    error.value = null;
  };
  const logout = () => {
    auth.logout();
    isUserLoggedIn.value = false;
    deviceLoginPending.value = false;
    deviceLoginInfo.value = null;
    isInitialized.value = false;
    clearCache();
  };
  const getAccessToken = async (): Promise<string | null> => {
    try {
      if (!isInitialized.value) {
        await init();
      }
      const credentials = await auth.credentialsProvider.getCredentials();
      return credentials?.token || null;
    } catch (err) {
      console.error('Error getting access token:', err);
      return null;
    }
  };
  const searchArtists = async (query: string, _limit = 20, _offset = 0, countryCode = 'US') => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        return await remote.apiFetch(`/api/tidal/search?q=${encodeURIComponent(query)}&type=artists&countryCode=${countryCode}`);
      }
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/searchResults/{id}', {
        params: {
          path: { id: query },
          query: { countryCode, include: ['artists'] },
        },
      });
      if (response.error) throw new Error(`Search error: ${JSON.stringify(response.error)}`);
      const searchData = response.data;
      if (!searchData?.data) return { data: [], included: [] };
      const relationships = searchData.data.relationships || {};
      const included = searchData.included || [];
      const artists = (relationships.artists?.data || []).map((ref: any) => {
        const artist = included.find((item: any) => item.type === 'artists' && item.id === ref.id);
        return artist || ref;
      });
      return { data: artists, included };
    } catch (err) {
      console.error('Error searching artists:', err);
      throw err;
    }
  };
  const searchAlbums = async (query: string, _limit = 20, _offset = 0, countryCode = 'US') => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        return await remote.apiFetch(`/api/tidal/search?q=${encodeURIComponent(query)}&type=albums&countryCode=${countryCode}`);
      }
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/searchResults/{id}', {
        params: {
          path: { id: query },
          query: { countryCode, include: ['albums'] },
        },
      });
      if (response.error) throw new Error(`Search error: ${JSON.stringify(response.error)}`);
      const searchData = response.data;
      if (!searchData?.data) return { data: [], included: [] };
      const relationships = searchData.data.relationships || {};
      const included = searchData.included || [];
      const albums = (relationships.albums?.data || []).map((ref: any) => {
        const album = included.find((item: any) => item.type === 'albums' && item.id === ref.id);
        return album || ref;
      });
      return { data: albums, included };
    } catch (err) {
      console.error('Error searching albums:', err);
      throw err;
    }
  };
  const searchTracks = async (query: string, _limit = 20, _offset = 0, countryCode = 'US') => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        return await remote.apiFetch(`/api/tidal/search?q=${encodeURIComponent(query)}&type=tracks&countryCode=${countryCode}`);
      }
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/searchResults/{id}', {
        params: {
          path: { id: query },
          query: { countryCode, include: ['tracks'] },
        },
      });
      if (response.error) throw new Error(`Search error: ${JSON.stringify(response.error)}`);
      const searchData = response.data;
      if (!searchData?.data) return { data: [], included: [] };
      const relationships = searchData.data.relationships || {};
      const included = searchData.included || [];
      const tracks = (relationships.tracks?.data || []).map((ref: any) => {
        const track = included.find((item: any) => item.type === 'tracks' && item.id === ref.id);
        return track || ref;
      });
      return { data: tracks, included };
    } catch (err) {
      console.error('Error searching tracks:', err);
      throw err;
    }
  };
  const searchAll = async (query: string, _limit = 10, countryCode = 'US') => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        return await remote.apiFetch(`/api/tidal/search?q=${encodeURIComponent(query)}&countryCode=${countryCode}`);
      }
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/searchResults/{id}', {
        params: {
          path: { id: query },
          query: { countryCode, include: ['artists', 'albums', 'tracks'] },
        },
      });
      if (response.error) throw new Error(`Search error: ${JSON.stringify(response.error)}`);
      const searchData = response.data;
      if (!searchData?.data) {
        return { artists: [], albums: [], tracks: [] };
      }
      const relationships = searchData.data.relationships || {};
      const included = searchData.included || [];
      const artists = (relationships.artists?.data || []).map((ref: any) => {
        const artist = included.find((item: any) => item.type === 'artists' && item.id === ref.id);
        return artist ? { ...artist, included } : { ...ref, included };
      });
      const albums = (relationships.albums?.data || []).map((ref: any) => {
        const album = included.find((item: any) => item.type === 'albums' && item.id === ref.id);
        return album ? { ...album, included } : { ...ref, included };
      });
      const tracks = (relationships.tracks?.data || []).map((ref: any) => {
        const track = included.find((item: any) => item.type === 'tracks' && item.id === ref.id);
        return track ? { ...track, included } : { ...ref, included };
      });
      return { artists, albums, tracks };
    } catch (err) {
      console.error('Error in general search:', err);
      throw err;
    }
  };
  const getArtist = async (artistId: string, countryCode = 'US', includes: string[] = ['biography', 'profileArt', 'providers', 'similarArtists']) => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        const cacheKey = `artist:${artistId}:remote`;
        const cached = getCached(cacheKey);
        if (cached !== null) return cached;
        const data = await remote.apiFetch(`/api/tidal/artist/${artistId}?countryCode=${countryCode}`);
        setCached(cacheKey, data);
        return data;
      }
      if (!isInitialized.value) await init();
      const cacheKey = `artist:${artistId}:${countryCode}:${includes.join(',')}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const response = await client.GET('/artists/{id}', {
        params: {
          path: { id: artistId },
          query: { countryCode, include: includes },
        },
      });
      if (response.error) {
        const error = new Error(`Error getting artist: ${JSON.stringify(response.error)}`) as any;
        if (response.error.status) error.status = response.error.status;
        else if (response.error.code) error.status = response.error.code;
        throw error;
      }
      const data = response.data;
      if (data) setCached(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Error getting artist:', err);
      throw err;
    }
  };
  const getAlbumsByArtist = async (artistId: string, countryCode = 'US', includes: string[] = ['artists', 'coverArt', 'genres', 'providers'], cursor?: string) => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        const cacheKey = `albums-by-artist:${artistId}:remote`;
        const cached = getCached(cacheKey);
        if (cached !== null) return cached;
        const data = await remote.apiFetch(`/api/tidal/artist/${artistId}/albums?countryCode=${countryCode}`);
        setCached(cacheKey, data);
        return data;
      }
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      if (cursor !== undefined) {
        const response = await client.GET('/artists/{id}/relationships/albums', {
          params: {
            path: { id: artistId },
            query: { countryCode, ...cursorParam(cursor) },
          },
        });
        if (response.error) throw new Error(`Error getting albums: ${JSON.stringify(response.error)}`);
        return response.data;
      }
      const cacheKey = `albums-by-artist:${artistId}:${countryCode}:${includes.join(',')}:all`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const allAlbumIds: string[] = [];
      let nextCursor: string | undefined;
      do {
        const response = await client.GET('/artists/{id}/relationships/albums', {
          params: {
            path: { id: artistId },
            query: { countryCode, ...cursorParam(nextCursor) },
          },
        });
        if (response.error) throw new Error(`Error getting albums: ${JSON.stringify(response.error)}`);
        if (!response.data) break;
        const albums = response.data.data || [];
        for (const album of albums) allAlbumIds.push(album.id);
        nextCursor = (response.data.links as any)?.meta?.nextCursor;
      } while (nextCursor);
      if (allAlbumIds.length === 0) return { data: [], included: [], links: {} };
      const PARALLEL_REQUESTS = 5;
      const allAlbums: any[] = [];
      const allIncluded: any[] = [];
      for (let i = 0; i < allAlbumIds.length; i += PARALLEL_REQUESTS) {
        const batchIds = allAlbumIds.slice(i, i + PARALLEL_REQUESTS);
        const batchPromises = batchIds.map((albumId) =>
          client.GET('/albums/{id}', {
            params: {
              path: { id: albumId },
              query: { countryCode, include: includes },
            },
          }).then((albumResponse) => {
            if (albumResponse.error || !albumResponse.data?.data) return { albums: [], included: [] };
            return {
              albums: [albumResponse.data.data],
              included: albumResponse.data.included || [],
            };
          }).catch(() => ({ albums: [], included: [] })),
        );
        const results = await Promise.all(batchPromises);
        for (const result of results) {
          allAlbums.push(...result.albums);
          allIncluded.push(...result.included);
        }
      }
      const result = { data: allAlbums, included: allIncluded, links: {} };
      if (result.data.length > 0) setCached(cacheKey, result);
      return result;
    } catch (err) {
      console.error('Error getting albums by artist:', err);
      throw err;
    }
  };
  const getAlbum = async (albumId: string, countryCode = 'US', includes: string[] = ['artists', 'coverArt', 'genres', 'items', 'owners', 'providers', 'similarAlbums']) => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        const cacheKey = `album:${albumId}:remote`;
        const cached = getCached(cacheKey);
        if (cached !== null) return cached;
        const data = await remote.apiFetch(`/api/tidal/album/${albumId}?countryCode=${countryCode}`);
        setCached(cacheKey, data);
        return data;
      }
      if (!isInitialized.value) await init();
      const cacheKey = `album:${albumId}:${countryCode}:${includes.join(',')}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const response = await client.GET('/albums/{id}', {
        params: {
          path: { id: albumId },
          query: { countryCode, include: includes },
        },
      });
      if (response.error) throw new Error(`Error getting album: ${JSON.stringify(response.error)}`);
      const data = response.data;
      if (data) setCached(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Error getting album:', err);
      throw err;
    }
  };
  const getTrack = async (trackId: string, countryCode = 'US', includes: string[] = ['artists', 'albums', 'coverArt', 'providers']) => {
    try {
      const remote = useRemoteClient();
      if (remote.isRemoteMode.value) {
        const cacheKey = `track:${trackId}:remote`;
        const cached = getCached(cacheKey);
        if (cached !== null) return cached;
        const data = await remote.apiFetch(`/api/tidal/album/${trackId}?countryCode=${countryCode}`);
        setCached(cacheKey, data);
        return data;
      }
      if (!isInitialized.value) await init();
      const cacheKey = `track:${trackId}:${countryCode}:${includes.join(',')}`;
      const cached = getCached(cacheKey);
      if (cached !== null) return cached;
      const client = getAPIClient();
      const response = await client.GET('/tracks/{id}', {
        params: {
          path: { id: trackId },
          query: { countryCode, include: includes },
        },
      });
      if (response.error) throw new Error(`Error getting track: ${JSON.stringify(response.error)}`);
      const data = response.data;
      if (data) setCached(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Error getting track:', err);
      throw err;
    }
  };
  const getFavoriteAlbums = async (locale = 'en-US', countryCode = 'US', cursor?: string) => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.GET('/userCollections/{id}/relationships/albums', {
        params: {
          path: { id: userId },
          query: { locale, countryCode, include: ['albums'], ...cursorParam(cursor) },
        },
      });
      if (response.error) throw new Error(`Error getting favorite albums: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error getting favorite albums:', err);
      throw err;
    }
  };
  const isAlbumFavorite = async (albumId: string, locale = 'en-US', countryCode = 'US'): Promise<boolean> => {
    try {
      const favorites = await getFavoriteAlbums(locale, countryCode);
      const albumIds = favorites?.data?.map((item: any) => item.id) || [];
      return albumIds.includes(albumId);
    } catch (err) {
      console.error('Error checking if album is favorite:', err);
      return false;
    }
  };
  const addAlbumToFavorites = async (albumId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.POST('/userCollections/{id}/relationships/albums', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id: albumId, type: 'albums' }] },
      });
      if (response.error) throw new Error(`Error adding album to favorites: ${JSON.stringify(response.error)}`);
      clearCache();
      return response.data;
    } catch (err) {
      console.error('Error adding album to favorites:', err);
      throw err;
    }
  };
  const removeAlbumFromFavorites = async (albumId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.DELETE('/userCollections/{id}/relationships/albums', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id: albumId, type: 'albums' }] },
      });
      if (response.error) throw new Error(`Error removing album from favorites: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error removing album from favorites:', err);
      throw err;
    }
  };
  const getFavoriteTracks = async (locale = 'en-US', countryCode = 'US', cursor?: string) => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.GET('/userCollections/{id}/relationships/tracks', {
        params: {
          path: { id: userId },
          query: { locale, countryCode, include: ['tracks'], ...cursorParam(cursor) },
        },
      });
      if (response.error) throw new Error(`Error getting favorite tracks: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error getting favorite tracks:', err);
      throw err;
    }
  };
  const isTrackFavorite = async (trackId: string, locale = 'en-US', countryCode = 'US'): Promise<boolean> => {
    try {
      const favorites = await getFavoriteTracks(locale, countryCode);
      const trackIds = favorites?.data?.map((item: any) => item.id) || [];
      return trackIds.includes(trackId);
    } catch (err) {
      console.error('Error checking if track is favorite:', err);
      return false;
    }
  };
  const addTrackToFavorites = async (trackId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.POST('/userCollections/{id}/relationships/tracks', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id: trackId, type: 'tracks' }] },
      });
      if (response.error) throw new Error(`Error adding track to favorites: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error adding track to favorites:', err);
      throw err;
    }
  };
  const removeTrackFromFavorites = async (trackId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.DELETE('/userCollections/{id}/relationships/tracks', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id: trackId, type: 'tracks' }] },
      });
      if (response.error) throw new Error(`Error removing track from favorites: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error removing track from favorites:', err);
      throw err;
    }
  };
  const getFollowedArtists = async (locale = 'en-US', countryCode = 'US', cursor?: string) => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.GET('/userCollections/{id}/relationships/artists', {
        params: {
          path: { id: userId },
          query: { countryCode, locale, ...cursorParam(cursor) },
        },
      });
      if (response.error) throw new Error(`Error getting followed artists: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error getting followed artists:', err);
      throw err;
    }
  };
  const isArtistFollowed = async (artistId: string, locale = 'en-US', countryCode = 'US'): Promise<boolean> => {
    try {
      const followed = await getFollowedArtists(locale, countryCode);
      const artistIds = followed?.data?.map((item: any) => item.id) || [];
      return artistIds.includes(artistId);
    } catch (err) {
      console.error('Error checking if artist is followed:', err);
      return false;
    }
  };
  const followArtist = async (artistId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.POST('/userCollections/{id}/relationships/artists', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id: artistId, type: 'artists' }] },
      });
      if (response.error) throw new Error(`Error following artist: ${JSON.stringify(response.error)}`);
      clearCache();
      return response.data;
    } catch (err) {
      console.error('Error following artist:', err);
      throw err;
    }
  };
  const unfollowArtist = async (artistId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const user = await getCurrentUser();
      const userId = user?.data?.id;
      if (!userId) throw new Error('Could not get user ID');
      const client = getAPIClient();
      const response = await client.DELETE('/userCollections/{id}/relationships/artists', {
        params: { path: { id: userId }, query: { countryCode } },
        body: { data: [{ id: artistId, type: 'artists' }] },
      });
      if (response.error) throw new Error(`Error unfollowing artist: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error unfollowing artist:', err);
      throw err;
    }
  };
  const getAlbumProviders = async (albumId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/albums/{id}/relationships/providers', {
        params: { path: { id: albumId }, query: { countryCode, include: ['providers'] } },
      });
      if (response.error) throw new Error(`Error getting album providers: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error getting album providers:', err);
      throw err;
    }
  };
  const getTrackProviders = async (trackId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/tracks/{id}/relationships/providers', {
        params: { path: { id: trackId }, query: { countryCode, include: ['providers'] } },
      });
      if (response.error) throw new Error(`Error getting track providers: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error getting track providers:', err);
      throw err;
    }
  };
  const getTrackCredits = async (trackId: string, countryCode = 'US') => {
    try {
      if (!isInitialized.value) await init();
      const client = getAPIClient();
      const response = await client.GET('/tracks/{id}/relationships/credits', {
        params: { path: { id: trackId }, query: { countryCode, include: ['credits'] } },
      });
      if (response.error) throw new Error(`Error getting track credits: ${JSON.stringify(response.error)}`);
      return response.data;
    } catch (err) {
      console.error('Error getting track credits:', err);
      throw err;
    }
  };
  const clearCredentials = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('tidal_credentials');
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('tidal')) keysToRemove.push(key);
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      }
      isUserLoggedIn.value = false;
      isInitialized.value = false;
    } catch (err) {
      console.error('Error clearing credentials:', err);
      error.value = err instanceof Error ? err.message : t('auth.errorClearingCredentials');
    } finally {
      isLoading.value = false;
    }
  };
  return {
    isInitialized: computed(() => isInitialized.value),
    isUserLoggedIn: computed(() => isUserLoggedIn.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    deviceLoginPending: computed(() => deviceLoginPending.value),
    deviceLoginInfo: computed(() => deviceLoginInfo.value),
    init,
    checkAuth,
    getAccessToken,
    startDeviceLogin,
    completeDeviceLogin,
    cancelDeviceLogin,
    logout,
    searchArtists,
    searchAlbums,
    searchTracks,
    searchAll,
    getArtist,
    getAlbumsByArtist,
    getAlbum,
    getTrack,
    clearCache,
    getCurrentUser,
    getFavoriteAlbums,
    isAlbumFavorite,
    addAlbumToFavorites,
    removeAlbumFromFavorites,
    getFavoriteTracks,
    isTrackFavorite,
    addTrackToFavorites,
    removeTrackFromFavorites,
    getFollowedArtists,
    isArtistFollowed,
    followArtist,
    unfollowArtist,
    getAlbumProviders,
    getTrackProviders,
    getTrackCredits,
    clearCredentials,
  };
}
