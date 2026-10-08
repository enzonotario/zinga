import type { TrackInfo } from '~/types/track';
import type { QueueTrack } from '~/utils/playQueue';
import { invoke } from '@tauri-apps/api/core';
import { computed, effectScope, readonly, watch } from 'vue';
import useDevices, { LOCAL_DEVICE_ID } from './useDevices';
import useDirectPlayer from './useDirectPlayer';
import usePlayQueue from './usePlayQueue';
import useRemoteClient from './useRemoteClient';
import { TIDAL_NOT_LOGGED_IN } from './useTidalPlayback';

let playerGlobalWatchersRegistered = false;

export default function usePlayer() {
  const { t } = useI18n();
  const { selectedDeviceId, isLocalPlayback } = useDevices();
  const queue = usePlayQueue();
  const direct = useDirectPlayer();
  const remote = useRemoteClient();

  const isPlaying = computed(() => direct.state.value === 'playing');
  const isPaused = computed(() => direct.state.value === 'paused');
  const currentItem = computed(() => direct.playingItem.value ?? queue.currentItem.value ?? null);
  const position = computed(() => direct.positionSec.value);
  const duration = computed(() => (currentItem.value?.track.length || 0) / 1000);
  const currentTrack = computed<TrackInfo | null>(() => {
    const track = currentItem.value?.track;
    if (!track) return null;
    return {
      title: track.name || t('player.unknownTitle'),
      artist: track.artists?.[0]?.name || t('player.unknownArtist'),
      album: track.album?.name || t('player.unknownAlbum'),
      duration: duration.value,
      position: position.value,
      uri: track.uri,
    };
  });

  function targetDeviceId() {
    return selectedDeviceId.value ?? LOCAL_DEVICE_ID;
  }

  async function startOn(deviceId: string, tlid: number, startSec = 0) {
    const activeDeviceId = direct.deviceId.value;
    if (activeDeviceId && activeDeviceId !== deviceId) await direct.stop();
    await direct.start(deviceId, tlid, startSec);
  }

  async function play() {
    if (remote.isRemoteMode.value) return;
    if (direct.isPaused.value) {
      await direct.resume();
      return;
    }
    if (direct.isActive.value) return;
    const item = queue.currentItem.value ?? queue.items.value[0];
    if (!item) return;
    await startOn(targetDeviceId(), item.tlid);
  }

  async function playTracks(tracks: QueueTrack[], startIndex = 0) {
    if (remote.isRemoteMode.value || tracks.length === 0) return;
    const added = queue.replace(tracks);
    const item = added[startIndex] ?? added[0];
    if (!item) return;
    await startOn(targetDeviceId(), item.tlid);
  }

  function addTracks(tracks: QueueTrack[]) {
    if (remote.isRemoteMode.value) return;
    queue.add(tracks);
  }

  async function playTlid(tlid: number) {
    if (remote.isRemoteMode.value) return;
    await startOn(targetDeviceId(), tlid);
  }

  function cancelPauseAtEndOfTrack() {
    direct.stopAfterCurrent.value = false;
  }

  function togglePauseAtEndOfTrack() {
    if (direct.stopAfterCurrent.value) {
      cancelPauseAtEndOfTrack();
      return;
    }
    if (!direct.isActive.value) return;
    direct.stopAfterCurrent.value = true;
  }

  async function pause() {
    if (remote.isRemoteMode.value) return;
    cancelPauseAtEndOfTrack();
    if (direct.isActive.value) {
      await direct.pause();
      return;
    }
    if (!isLocalPlayback.value) return;
    try {
      await invoke('mopidy_stop_test_sound');
    } catch (err) {
      console.error('Stop Test Sound Error:', err);
    }
  }

  async function togglePlayPause() {
    if (isPlaying.value) await pause();
    else await play();
  }

  function selectRelative(offset: 1 | -1) {
    const list = queue.items.value;
    const index = list.findIndex((item) => item.tlid === queue.currentTlid.value);
    const target = list[index + offset];
    if (target) queue.setCurrent(target.tlid);
  }

  async function next() {
    if (remote.isRemoteMode.value) return;
    cancelPauseAtEndOfTrack();
    if (!direct.isActive.value) {
      selectRelative(1);
      return;
    }
    await direct.next();
  }

  async function previous() {
    if (remote.isRemoteMode.value) return;
    cancelPauseAtEndOfTrack();
    if (!direct.isActive.value) {
      selectRelative(-1);
      return;
    }
    await direct.previous();
  }

  async function seek(seconds: number) {
    if (remote.isRemoteMode.value) return;
    await direct.seek(seconds);
  }

  async function stop() {
    if (remote.isRemoteMode.value) return;
    await direct.stop();
  }

  async function clear() {
    if (remote.isRemoteMode.value) return;
    await direct.stop();
    queue.clear();
  }

  async function testSound() {
    if (!isLocalPlayback.value) {
      await play();
      return;
    }
    const toast = useToast();
    try {
      await invoke('mopidy_test_sound');
      toast.add({ title: t('player.soundTestStarted'), color: 'success', duration: 2000 });
    } catch (err) {
      console.error('Test Sound Error:', err);
      toast.add({ title: t('player.soundTestError'), description: String(err), color: 'error' });
    }
  }

  if (import.meta.client && !playerGlobalWatchersRegistered) {
    playerGlobalWatchersRegistered = true;
    effectScope(true).run(() => {
      const toast = useToast();
      watch(direct.lastError, (message) => {
        if (!message) return;
        direct.lastError.value = null;
        if (message.includes(TIDAL_NOT_LOGGED_IN)) {
          toast.add({ title: t('player.tidalPlaybackNotConnected'), color: 'warning', duration: 8000 });
          return;
        }
        toast.add({ title: t('player.playbackError'), description: message, color: 'error', duration: 8000 });
      });
      watch(selectedDeviceId, async (newId) => {
        const tlid = direct.playingItem.value?.tlid;
        if (!direct.isActive.value || tlid == null) return;
        const positionSec = direct.positionSec.value;
        try {
          await direct.stop();
          if (newId) await direct.start(newId, tlid, positionSec);
        } catch (err) {
          console.error('Device switch error:', err);
        }
      });
    });
  }

  return {
    isPlaying,
    isDevicePlaying: direct.isDevicePlaying,
    isPaused,
    currentItem,
    currentTrack,
    position,
    duration,
    progress: computed(() => (duration.value > 0 ? (position.value / duration.value) * 100 : 0)),
    play,
    playTracks,
    addTracks,
    playTlid,
    testSound,
    pause,
    stop,
    togglePlayPause,
    next,
    previous,
    seek,
    clear,
    pauseAtEndOfTrack: readonly(direct.stopAfterCurrent),
    togglePauseAtEndOfTrack,
    cancelPauseAtEndOfTrack,
  };
}
