import type { Ref } from 'vue';
import { computed } from 'vue';
import useTidalAuth from './useTidalAuth';

const CACHE_PREFIX = 'tidal_img_';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const albumCoverCache = new Map<string, string | null>();
const artistPictureCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();
function createStatusError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}
function getFromPersistentCache(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;
    const { url, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
function saveToPersistentCache(key: string, url: string | null): void {
  if (typeof window === 'undefined' || !url) return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ url, timestamp: Date.now() }));
  } catch {
  }
}
export default function useTidalArtwork() {
  const tidalAuth = useTidalAuth();
  function getArtworkUrl(entity: any, minWidth = 320): string | null {
    if (!entity) return null;
    const artworkRelation = entity.relationships?.profileArt || entity.relationships?.coverArt;
    const artworkData = artworkRelation?.data;
    if (!artworkData?.length) return null;
    const artworkId = artworkData[0]?.id;
    if (!artworkId) return null;
    const artwork = entity.included?.find((item: any) =>
      item.type === 'artworks' && item.id === artworkId,
    );
    if (!artwork?.attributes?.files?.length) return null;
    const files = artwork.attributes.files;
    const largest = files.find((f: any) => f.meta?.width >= minWidth) || files[files.length - 1];
    return largest?.href || null;
  }
  async function getArtistPicture(
    artist: any,
    artistId?: string,
    countryCode = 'US',
    minWidth = 640,
  ): Promise<string | null> {
    if (artist?.included) return getArtworkUrl(artist, minWidth);
    const id = artistId || artist?.id;
    if (!id) return null;
    const cacheKey = `artist:${id}:${minWidth}`;
    if (artistPictureCache.has(cacheKey)) return artistPictureCache.get(cacheKey) || null;
    const persistedUrl = getFromPersistentCache(cacheKey);
    if (persistedUrl) {
      artistPictureCache.set(cacheKey, persistedUrl);
      return persistedUrl;
    }
    if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;
    const requestPromise = (async () => {
      try {
        const result = await tidalAuth.getArtist(id, countryCode, ['profileArt']);
        if (result?.data && result?.included) {
          const url = getArtworkUrl({ ...result.data, included: result.included }, minWidth);
          artistPictureCache.set(cacheKey, url);
          saveToPersistentCache(cacheKey, url);
          return url;
        }
        artistPictureCache.set(cacheKey, null);
        return null;
      } catch (error: any) {
        if (error?.status) throw createStatusError(error.message ?? 'Request failed', error.status);
        if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
          throw createStatusError(error.message ?? 'Rate limit exceeded', 429);
        }
        throw error;
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();
    pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }
  function useArtistPicture(artist: Ref<any> | (() => any), minWidth = 640) {
    return computed(() => {
      const artistValue = typeof artist === 'function' ? artist() : artist.value;
      return getArtworkUrl(artistValue, minWidth);
    });
  }
  async function getAlbumCover(
    album: any,
    albumId?: string,
    countryCode = 'US',
    minWidth = 640,
  ): Promise<string | null> {
    if (album?.included) return getArtworkUrl(album, minWidth);
    const id = albumId || album?.id;
    if (!id) return null;
    const cacheKey = `album:${id}:${minWidth}`;
    if (albumCoverCache.has(cacheKey)) return albumCoverCache.get(cacheKey) || null;
    const persistedUrl = getFromPersistentCache(cacheKey);
    if (persistedUrl) {
      albumCoverCache.set(cacheKey, persistedUrl);
      return persistedUrl;
    }
    if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;
    const requestPromise = (async () => {
      try {
        const result = await tidalAuth.getAlbum(id, countryCode, ['coverArt']);
        if (result?.data && result?.included) {
          const url = getArtworkUrl({ ...result.data, included: result.included }, minWidth);
          albumCoverCache.set(cacheKey, url);
          saveToPersistentCache(cacheKey, url);
          return url;
        }
        albumCoverCache.set(cacheKey, null);
        return null;
      } catch (error) {
        console.error('Error getting album cover:', error);
        return null;
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();
    pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }
  function useAlbumCover(album: Ref<any> | (() => any), minWidth = 640) {
    return computed(() => {
      const albumValue = typeof album === 'function' ? album() : album.value;
      return getArtworkUrl(albumValue, minWidth);
    });
  }
  return {
    getArtworkUrl,
    getArtistPicture,
    useArtistPicture,
    getAlbumCover,
    useAlbumCover,
  };
}
