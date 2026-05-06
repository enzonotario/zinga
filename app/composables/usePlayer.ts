import type { TrackInfo } from '~/types/track';
import { invoke } from '@tauri-apps/api/core';
import { computed, watch } from 'vue';
import useDevices from './useDevices';
import useMopidy from './useMopidy';
import useRemoteClient from './useRemoteClient';
import useUpnpPlayer from './useUpnpPlayer';

let playerGlobalWatchersRegistered = false;

export default function usePlayer() {
  const { t } = useI18n();
  const { selectedDeviceId, isLocalPlayback } = useDevices();
  const mopidy = useMopidy();
  const upnp = useUpnpPlayer();
  const remote = useRemoteClient();
  const isUpnpMode = computed(() => !isLocalPlayback.value && !!selectedDeviceId.value);
  const isPlaying = computed(() => mopidy.isPlaying.value);
  const isPaused = computed(() => mopidy.isPaused.value);
  const position = computed(() => mopidy.position.value / 1000);
  const duration = computed(() => (mopidy.currentTrack.value?.track?.length || 0) / 1000);
  const currentTrack = computed<TrackInfo | null>(() => {
    const track = mopidy.currentTrack.value?.track;
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
  async function play() {
    if (remote.isRemoteMode.value) return mopidy.play();
    try {
      if (isUpnpMode.value && selectedDeviceId.value) {
        await invoke('set_local_loopback_mute', { mute: true }).catch((err) => console.warn('Failed to mute local loopback:', err));
        const track = mopidy.currentTrack.value?.track;
        if (track?.uri) {
          const directUri = await mopidy.getStreamUri(track.uri);
          if (directUri && (directUri.startsWith('http://') || directUri.startsWith('https://'))) {
            console.log('[Player] Using Direct URI for UPnP:', directUri);
            await mopidy.play();
            await upnp.setUriAndPlay(selectedDeviceId.value, directUri);
            return;
          }
        }
        const hostIp = await invoke<string>('get_host_ip').catch(() => 'localhost');
        const icecastUri = `http://${hostIp}:8000/mopidy`;
        console.log('[Player] Using Icecast Fallback for UPnP:', icecastUri);
        await mopidy.play();
        await new Promise((r) => setTimeout(r, 450));
        await upnp.setUriAndPlay(selectedDeviceId.value, icecastUri);
        return;
      } else if (isLocalPlayback.value) {
        await invoke('set_local_loopback_mute', { mute: false }).catch((err) => console.warn('Failed to unmute local loopback:', err));
      }
      await mopidy.play();
    } catch (err) {
      console.error('Playback Error:', err);
    }
  }
  async function playUris(uris: string[]) {
    try {
      await mopidy.clear();
      await mopidy.add(uris);
      await play();
    } catch (err) {
      console.error('Play URIs Error:', err);
    }
  }
  async function pause() {
    if (remote.isRemoteMode.value) return mopidy.pause();
    await mopidy.pause();
    if (isLocalPlayback.value) {
      await stopTestSound();
    } else if (isUpnpMode.value && selectedDeviceId.value) {
      await upnp.pause(selectedDeviceId.value);
    }
  }
  async function togglePlayPause() {
    if (isPlaying.value) await pause();
    else await play();
  }
  async function next() {
    await mopidy.next();
  }
  async function previous() {
    await mopidy.previous();
  }
  async function testSound() {
    const toast = useToast();
    if (isLocalPlayback.value) {
      try {
        await invoke('mopidy_test_sound');
        toast.add({ title: t('player.soundTestStarted'), color: 'success', duration: 2000 });
      } catch (err) {
        console.error('Test Sound Error:', err);
        toast.add({ title: t('player.soundTestError'), description: String(err), color: 'error' });
      }
    } else {
      await play();
    }
  }
  async function stopTestSound() {
    if (isLocalPlayback.value) {
      try {
        await invoke('mopidy_stop_test_sound');
      } catch (err) {
        console.error('Stop Test Sound Error:', err);
      }
    }
  }
  async function seek(seconds: number) {
    await mopidy.mopidyRpc('core.playback.seek', { time_position: seconds * 1000 });
    await mopidy.refreshState();
  }
  async function stop() {
    await mopidy.stop();
    if (isUpnpMode.value && selectedDeviceId.value) {
      await upnp.stop(selectedDeviceId.value);
    }
  }
  async function clear() {
    await mopidy.clear();
    await stop();
  }
  if (import.meta.client && !playerGlobalWatchersRegistered) {
    playerGlobalWatchersRegistered = true;
    watch(() => mopidy.currentState.value.state, (newState, oldState) => {
      if (
        !isUpnpMode.value
        && newState === 'stopped'
        && oldState !== 'stopped'
        && !mopidy.currentTrack.value
        && mopidy.tracklist.value.length > 0
      ) {
        mopidy.clear();
      }
      if (newState === 'stopped' && oldState !== 'stopped' && isUpnpMode.value && selectedDeviceId.value) {
        const deviceId = selectedDeviceId.value;
        let elapsed = 0;
        const POLL_MS = 1000;
        const MAX_WAIT_MS = 30000;
        const poll = setInterval(async () => {
          await upnp.refreshStatus(deviceId);
          elapsed += POLL_MS;
          const state = upnp.currentUpnpState.value;
          if (state !== 'PLAYING' && state !== 'TRANSITIONING') {
            clearInterval(poll);
            await upnp.stop(deviceId);
            return;
          }
          if (elapsed >= MAX_WAIT_MS) {
            clearInterval(poll);
            if (mopidy.currentState.value.state === 'stopped') {
              await upnp.stop(deviceId);
            }
          }
        }, POLL_MS);
      }
    });
    watch(selectedDeviceId, async (newId, oldId) => {
      if (isPlaying.value && newId && newId !== 'local') {
        await invoke('set_local_loopback_mute', { mute: true }).catch((err) => console.warn('Failed to mute local loopback:', err));
        const hostIp = await invoke<string>('get_host_ip').catch(() => 'localhost');
        await upnp.setUriAndPlay(newId, `http://${hostIp}:8000/mopidy`);
      } else if (newId === 'local' && oldId) {
        await invoke('set_local_loopback_mute', { mute: false }).catch((err) => console.warn('Failed to unmute local loopback:', err));
        await upnp.stop(oldId);
      }
    });
  }
  return {
    isPlaying,
    isPaused,
    currentTrack,
    position,
    duration,
    progress: computed(() => (duration.value > 0 ? (position.value / duration.value) * 100 : 0)),
    play,
    playUris,
    testSound,
    pause,
    stop,
    togglePlayPause,
    next,
    previous,
    seek,
    clear,
    refresh: mopidy.refreshState,
  };
}
