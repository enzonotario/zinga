import { computed, ref, watch } from 'vue';
import { fetchTidalMetadata } from '~/utils/tidalMetadata';
import { timeToSeconds } from '~/utils/time';
import useDevices from './useDevices';
import useMopidy from './useMopidy';
import usePlayer from './usePlayer';
import useTidalArtwork from './useTidalArtwork';
import useTidalAuth from './useTidalAuth';
import useUpnpPlayer from './useUpnpPlayer';

const mopidyTidalData = ref<any>(null);
export default function useBottomBar() {
  const { t } = useI18n();
  const { selectedDeviceId, volume, setVolume, pauseVolumePolling, resumeVolumePolling } = useDevices();
  const player = usePlayer();
  const mopidy = useMopidy();
  const tidalArtwork = useTidalArtwork();
  const tidalAuth = useTidalAuth();
  const upnp = useUpnpPlayer();
  const { isLocalPlayback } = useDevices();
  const isUsingMopidy = computed(() => {
    return mopidy.isPlaying.value
      || mopidy.isPaused.value
      || (mopidy.tracklist.value && mopidy.tracklist.value.length > 0);
  });
  async function fetchMopidyTidalData(uri?: string) {
    if (!uri) {
      mopidyTidalData.value = null;
      return;
    }
    if (mopidyTidalData.value?.uri === uri) {
      return;
    }
    mopidyTidalData.value = await fetchTidalMetadata(uri, tidalArtwork, tidalAuth);
  }
  function buildTrackFromMopidy(track: { name?: string, artists?: { name: string }[], album?: { name: string }, length?: number, uri?: string }, positionSeconds: number) {
    const duration = (track.length || 0) / 1000;
    return {
      title: track.name || t('player.unknownTitle'),
      artist: track.artists?.[0]?.name || t('player.unknownArtist'),
      album: track.album?.name || t('player.unknownAlbum'),
      coverUrl: mopidyTidalData.value?.coverUrl || null,
      artistPicture: mopidyTidalData.value?.artistPicture || null,
      duration,
      position: positionSeconds,
      uri: track.uri,
      tidalData: mopidyTidalData.value
        ? {
            track: mopidyTidalData.value.track,
            album: mopidyTidalData.value.album,
            artist: mopidyTidalData.value.artist,
          }
        : undefined,
    };
  }
  const currentTrack = computed(() => {
    if (mopidy.currentTrack.value?.track) {
      const track = mopidy.currentTrack.value.track;
      let posSeconds = mopidy.position.value / 1000;

      if (!isLocalPlayback.value && selectedDeviceId.value && upnp.currentUpnpState.value === 'PLAYING') {
        const upnpPos = timeToSeconds(upnp.positionInfo.value.rel_time);
        if (upnpPos > 0) {
          posSeconds = upnpPos;
        }
      }

      return buildTrackFromMopidy(track, posSeconds);
    }
    return null;
  });
  const progress = computed(() => {
    const track = currentTrack.value;
    if (track && track.duration > 0) {
      return (track.position / track.duration) * 100;
    }
    return 0;
  });
  const hasTrack = computed(() => currentTrack.value !== null);
  const volumeDisplay = computed(() => volume.value ?? 0);
  const handleProgressChange = (value: number) => {
    if (!currentTrack.value) return;
    const newPosition = (value / 100) * currentTrack.value.duration;
    player.seek(newPosition);
  };
  const handleVolumeChange = (value: number) => {
    setVolume(value);
  };
  const decreaseVolume = () => {
    const currentVol = volume.value ?? 0;
    const newVol = Math.max(0, currentVol - 1);
    setVolume(newVol);
  };
  const increaseVolume = () => {
    const currentVol = volume.value ?? 0;
    const newVol = Math.min(100, currentVol + 1);
    setVolume(newVol);
  };
  watch(isUsingMopidy, (isUsing) => {
    if (isUsing) {
      mopidy.refresh();
    }
  });
  watch(
    () => mopidy.currentTrack.value?.track?.uri,
    (uri, oldUri) => {
      if (uri) {
        const uriChanged = uri !== oldUri;
        const noCachedData = !mopidyTidalData.value || mopidyTidalData.value.uri !== uri;
        if (uriChanged || noCachedData) {
          mopidyTidalData.value = null;
          fetchMopidyTidalData(uri);
        }
      } else {
        mopidyTidalData.value = null;
      }
    },
    { immediate: true },
  );
  return {
    selectedDeviceId,
    volume,
    currentTrack,
    hasTrack,
    volumeDisplay,
    progress,
    handleProgressChange,
    handleVolumeChange,
    decreaseVolume,
    increaseVolume,
    pauseVolumePolling,
    resumeVolumePolling,
    isUsingMopidy,
  };
}
