import { computed } from 'vue';
import { extractTidalIds } from '~/utils/tidal';
import useBottomBar from './useBottomBar';

export default function useTidalNavigation() {
  const { currentTrack } = useBottomBar();
  const tidalIds = computed(() => {
    if (!currentTrack.value?.streamServiceId) {
      return {
        artistId: undefined,
        albumId: undefined,
        trackId: undefined,
      };
    }
    return extractTidalIds(currentTrack.value.streamServiceId);
  });
  const artistId = computed(() => {
    if (currentTrack.value?.uri) {
      const uriIds = extractTidalIds(currentTrack.value.uri);
      if (uriIds.artistId) {
        return uriIds.artistId;
      }
    }
    if (tidalIds.value.artistId) {
      return tidalIds.value.artistId;
    }
    const artist = currentTrack.value?.tidalData?.artist;
    if (artist?.data?.id) {
      return artist.data.id;
    }
    if (artist?.id) {
      return artist.id;
    }
    const track = currentTrack.value?.tidalData?.track;
    if (track?.relationships?.artists?.data?.[0]?.id) {
      return track.relationships.artists.data[0].id;
    }
    return undefined;
  });
  const albumId = computed(() => {
    if (tidalIds.value.albumId) {
      return tidalIds.value.albumId;
    }
    const album = currentTrack.value?.tidalData?.album;
    if (album?.data?.id) {
      return album.data.id;
    }
    if (album?.id) {
      return album.id;
    }
    const track = currentTrack.value?.tidalData?.track;
    if (track?.relationships?.albums?.data?.[0]?.id) {
      return track.relationships.albums.data[0].id;
    }
    return undefined;
  });
  const trackId = computed(() => {
    if (tidalIds.value.trackId) {
      return tidalIds.value.trackId;
    }
    const track = currentTrack.value?.tidalData?.track;
    if (track?.id) {
      return track.id;
    }
    return undefined;
  });
  const albumRoute = computed(() => {
    const id = albumId.value;
    return id ? `/album/${id}` : null;
  });
  const artistRoute = computed(() => {
    const id = artistId.value;
    return id ? `/artist/${id}` : null;
  });
  const hasTidalData = computed(() => {
    return !!(artistId.value || albumId.value || trackId.value);
  });
  return {
    tidalIds,
    artistId,
    albumId,
    trackId,
    albumRoute,
    artistRoute,
    hasTidalData,
  };
}
