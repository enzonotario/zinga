import type { QueueTrack } from '~/utils/playQueue';
import { computed, ref, watch } from 'vue';
import { parsePlaybackSnapshot } from '~/utils/remoteSnapshot';
import { fetchTidalMetadata } from '~/utils/tidalMetadata';
import useDevices from './useDevices';
import useDirectPlayer from './useDirectPlayer';
import usePlayer from './usePlayer';
import usePlayQueue from './usePlayQueue';
import useRemoteClient from './useRemoteClient';
import useTidalArtwork from './useTidalArtwork';
import useTidalAuth from './useTidalAuth';

const currentTidalData = ref<any>(null);

function queueCoverUrl(track?: QueueTrack | null) {
  return track?.coverUrl || null;
}

export function currentPlaybackArtwork(track?: QueueTrack | null) {
  return {
    coverUrl: currentTidalData.value?.coverUrl || queueCoverUrl(track) || null,
    artistPicture: currentTidalData.value?.artistPicture ?? null,
  };
}
export default function useBottomBar() {
  const { t } = useI18n();
  const { selectedDeviceId, volume, setVolume, pauseVolumePolling, resumeVolumePolling, syncVolumeFromDevice, isVolumeSyncing } = useDevices();
  const player = usePlayer();
  const queue = usePlayQueue();
  const direct = useDirectPlayer();
  const tidalArtwork = useTidalArtwork();
  const tidalAuth = useTidalAuth();
  const remote = useRemoteClient();
  const remotePlayback = computed(() => parsePlaybackSnapshot(remote.lastPlaybackState.value));
  const hasQueue = computed(() => queue.items.value.length > 0 || direct.isActive.value);
  async function fetchCurrentTidalData(uri?: string) {
    if (!uri) {
      currentTidalData.value = null;
      return;
    }
    if (currentTidalData.value?.uri === uri) {
      return;
    }
    currentTidalData.value = await fetchTidalMetadata(uri, tidalArtwork, tidalAuth);
  }
  function buildTrack(track: QueueTrack, positionSeconds: number) {
    const duration = (track.length || 0) / 1000;
    const remoteCover = remote.isRemoteMode.value ? remotePlayback.value.coverUrl : null;
    const remoteArtistPicture = remote.isRemoteMode.value ? remotePlayback.value.artistPicture : null;
    return {
      title: track.name || t('player.unknownTitle'),
      artist: track.artists?.[0]?.name || t('player.unknownArtist'),
      album: track.album?.name || t('player.unknownAlbum'),
      albumUri: track.album?.uri || null,
      coverUrl: remoteCover || currentTidalData.value?.coverUrl || queueCoverUrl(track),
      artistPicture: remoteArtistPicture || currentTidalData.value?.artistPicture || null,
      duration,
      position: positionSeconds,
      uri: track.uri,
      tidalData: currentTidalData.value
        ? {
            track: currentTidalData.value.track,
            album: currentTidalData.value.album,
            artist: currentTidalData.value.artist,
          }
        : undefined,
    };
  }
  const playbackPositionSec = computed(() => {
    let sec = player.position.value;
    const durationSec = (player.currentItem.value?.track.length || 0) / 1000;
    if (durationSec > 0) {
      sec = Math.min(sec, durationSec);
    }
    return Math.max(0, sec);
  });
  const currentTrack = computed(() => {
    const track = player.currentItem.value?.track;
    if (!track) return null;
    return buildTrack(track, playbackPositionSec.value);
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
  watch(
    () => player.currentItem.value?.track.uri,
    (uri, oldUri) => {
      if (!uri) {
        currentTidalData.value = null;
        return;
      }
      if (!uri.startsWith('tidal:track:')) {
        currentTidalData.value = null;
        return;
      }
      const uriChanged = uri !== oldUri;
      const noCachedData = !currentTidalData.value || currentTidalData.value.uri !== uri;
      if (uriChanged || noCachedData) {
        currentTidalData.value = null;
        fetchCurrentTidalData(uri);
      }
    },
    { immediate: true },
  );
  return {
    selectedDeviceId,
    volume,
    currentTrack,
    hasTrack,
    playbackPositionSec,
    volumeDisplay,
    progress,
    handleProgressChange,
    handleVolumeChange,
    decreaseVolume,
    increaseVolume,
    pauseVolumePolling,
    resumeVolumePolling,
    syncVolumeFromDevice,
    isVolumeSyncing,
    hasQueue,
  };
}
