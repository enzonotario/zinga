import { extractTidalIds } from '~/providers/tidal/utils';

export { extractTidalIds, extractTidalIdsFromUri, parseTidalUrls } from '~/providers/tidal/utils';
const trackInfoCache = new Map<string, { data: any, timestamp: number }>();
const pendingTrackInfoRequests = new Map<string, Promise<any>>();
const TRACK_INFO_CACHE_TTL = 5 * 60 * 1000;
export async function getTidalTrackInfo(uriOrStreamServiceId?: string, countryCode = 'US', tidalAuth = useTidalAuth()) {
  if (!uriOrStreamServiceId) {
    return null;
  }
  const { trackId } = extractTidalIds(uriOrStreamServiceId);
  if (!trackId) {
    return null;
  }
  const cacheKey = `track:${trackId}:${countryCode}`;
  const cached = trackInfoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TRACK_INFO_CACHE_TTL) {
    return cached.data;
  }
  if (pendingTrackInfoRequests.has(cacheKey)) {
    return pendingTrackInfoRequests.get(cacheKey);
  }
  const requestPromise = (async () => {
    try {
      const track = await tidalAuth.getTrack(trackId, countryCode);
      if (!track) {
        return null;
      }
      const trackData = track?.data || track;
      const trackIncluded = track?.included || [];
      const albumRef = trackData?.relationships?.albums?.data?.[0];
      const artistRef = trackData?.relationships?.artists?.data?.[0];
      let album = null;
      let artist = null;
      if (albumRef) {
        const albumIncluded = trackIncluded.find(
          (item: any) => item.type === 'albums' && item.id === albumRef.id,
        );
        if (albumIncluded) {
          album = {
            data: albumIncluded,
            included: trackIncluded,
          };
        } else if (albumRef.id) {
          try {
            const albumResult = await tidalAuth.getAlbum(albumRef.id, countryCode, ['coverArt']);
            if (albumResult?.data) {
              album = {
                data: albumResult.data,
                included: [...trackIncluded, ...(albumResult.included || [])],
              };
            }
          } catch (error) {
            console.error('Error obteniendo álbum:', error);
          }
        }
      }
      if (artistRef) {
        const artistIncluded = trackIncluded.find(
          (item: any) => item.type === 'artists' && item.id === artistRef.id,
        );
        if (artistIncluded) {
          artist = {
            data: artistIncluded,
            included: trackIncluded,
          };
        } else if (artistRef.id) {
          try {
            const artistResult = await tidalAuth.getArtist(artistRef.id, countryCode, ['profileArt']);
            if (artistResult?.data) {
              artist = {
                data: artistResult.data,
                included: [...trackIncluded, ...(artistResult.included || [])],
              };
            }
          } catch (error) {
            console.error('Error obteniendo artista:', error);
          }
        }
      }
      const result = {
        track,
        album,
        artist,
      };
      trackInfoCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Error obteniendo información de Tidal:', error);
      return null;
    } finally {
      pendingTrackInfoRequests.delete(cacheKey);
    }
  })();
  pendingTrackInfoRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
