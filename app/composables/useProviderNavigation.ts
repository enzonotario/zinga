import { computed } from 'vue';
import { getCurrentProviderId } from '~/providers';
import { extractTidalIds } from '~/providers/tidal/utils';
import useBottomBar from './useBottomBar';

export default function useProviderNavigation() {
  const { currentTrack } = useBottomBar();
  const providerId = getCurrentProviderId();
  const providerIds = computed(() => {
    if (!currentTrack.value?.streamServiceId) {
      return { artistId: undefined, albumId: undefined, trackId: undefined };
    }
    if (providerId === 'tidal') {
      return extractTidalIds(currentTrack.value.streamServiceId);
    }
    return { artistId: undefined, albumId: undefined, trackId: undefined };
  });
  const artistId = computed(() => {
    if (currentTrack.value?.uri && providerId === 'tidal') {
      const uriIds = extractTidalIds(currentTrack.value.uri);
      if (uriIds.artistId) {
        return uriIds.artistId;
      }
    }
    if (providerIds.value.artistId) {
      return providerIds.value.artistId;
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
    if (providerIds.value.albumId) {
      return providerIds.value.albumId;
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
    if (providerIds.value.trackId) {
      return providerIds.value.trackId;
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
  const hasProviderData = computed(() => {
    return !!(artistId.value || albumId.value || trackId.value);
  });
  return {
    providerIds,
    artistId,
    albumId,
    trackId,
    albumRoute,
    artistRoute,
    hasProviderData,
  };
}
