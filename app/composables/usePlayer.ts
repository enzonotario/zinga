import type { TrackInfo } from '~/types/track';
import { invoke } from '@tauri-apps/api/core';
import { computed, readonly, watch } from 'vue';
import { timeToSeconds } from '~/utils/time';
import useDevices, { LOCAL_DEVICE_ID } from './useDevices';
import useMopidy from './useMopidy';
import useRemoteClient from './useRemoteClient';
import useSystemSetup from './useSystemSetup';
import useUpnpPlayer from './useUpnpPlayer';

const PAUSE_AT_END_POLL_MS = 250;
const PAUSE_AT_END_THRESHOLD_MS = 500;

let playerGlobalWatchersRegistered = false;
let pauseAtEndPollId: ReturnType<typeof setInterval> | null = null;
const pauseAtEndOfTrack = ref(false);
const pauseAtEndTlid = ref<number | null>(null);

export default function usePlayer() {
  const { t } = useI18n();
  const { selectedDeviceId, isLocalPlayback } = useDevices();
  const mopidy = useMopidy();
  const upnp = useUpnpPlayer();
  const remote = useRemoteClient();
  const { ensurePipeline, pipelineReady } = useSystemSetup();
  const isUpnpMode = computed(() => !isLocalPlayback.value && !!selectedDeviceId.value);
  const isPlaying = computed(() => mopidy.isPlaying.value);
  const isDevicePlaying = computed(() => {
    if (isUpnpMode.value) return upnp.isDevicePlaying.value;
    return mopidy.isPlaying.value;
  });
  const isPaused = computed(() => mopidy.isPaused.value);
  const position = computed(() => {
    if (isUpnpMode.value) return upnp.displayPositionSec.value;
    return mopidy.position.value / 1000;
  });
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
  async function resolveUpnpStreamUri() {
    const track = mopidy.currentTrack.value?.track;
    if (track?.uri) {
      const directUri = await mopidy.getStreamUri(track.uri);
      if (directUri && (directUri.startsWith('http://') || directUri.startsWith('https://'))) {
        return directUri;
      }
    }
    const hostIp = await invoke<string>('get_host_ip').catch(() => 'localhost');
    return `http://${hostIp}:8000/mopidy`;
  }
  function resolveTrackPositionSec() {
    const track = mopidy.currentTrack.value?.track;
    let trackPositionSec = mopidy.position.value / 1000;
    const durationSec = (track?.length ?? 0) / 1000;
    if (durationSec > 0 && trackPositionSec > durationSec) {
      trackPositionSec = 0;
    }
    return trackPositionSec;
  }
  async function pushCurrentTrackToUpnp(
    deviceId: string,
    options: { icecastDelay?: boolean, resumeFromSec?: number, trackPositionSec?: number } = {},
  ) {
    await mopidy.refreshState().catch(() => {});
    const trackPositionSec = options.trackPositionSec ?? resolveTrackPositionSec();
    const uri = await resolveUpnpStreamUri();
    if (options.icecastDelay && uri.includes(':8000/mopidy')) {
      await new Promise((r) => setTimeout(r, 450));
    }
    await upnp.setUriAndPlay(deviceId, uri, {
      resumeFromSec: options.resumeFromSec,
      trackPositionSec: options.resumeFromSec != null ? undefined : trackPositionSec,
    });
  }
  async function syncUpnpOnTrackChange(deviceId: string) {
    await mopidy.refreshState().catch(() => {});
    const trackPositionSec = resolveTrackPositionSec();
    const uri = await resolveUpnpStreamUri();
    const isContinuousIcecast = uri.includes(':8000/mopidy');

    if (isContinuousIcecast && upnp.hasActiveUpnpSession.value) {
      const state = await upnp.recalibrateTrack(deviceId, trackPositionSec);
      const normalized = state.trim().toUpperCase();
      if (normalized === 'PLAYING' || normalized === 'TRANSITIONING' || normalized === 'PAUSED' || normalized === 'PAUSED_PLAYBACK') {
        return;
      }
    }

    await pushCurrentTrackToUpnp(deviceId, { icecastDelay: isContinuousIcecast });
  }
  async function ensureUpnpPipeline(force = false) {
    if (!force && pipelineReady.value) return true;
    const result = await ensurePipeline(force);
    return result.ready;
  }
  async function playOnUpnp(deviceId: string) {
    const toast = useToast();
    await invoke('set_local_loopback_mute', { mute: true }).catch((err) => console.warn('Failed to mute local loopback:', err));

    let ready = await ensureUpnpPipeline(false);
    if (!ready) {
      ready = await ensureUpnpPipeline(true);
    }
    if (!ready) {
      toast.add({
        title: t('player.pipelineNotReady'),
        color: 'error',
        duration: 5000,
      });
      throw new Error(t('player.pipelineNotReady'));
    }

    if (mopidy.isPaused.value && upnp.hasActiveUpnpSession.value) {
      const resumeFromSec = upnp.displayPositionSec.value || mopidy.position.value / 1000;
      await mopidy.play();
      await pushCurrentTrackToUpnp(deviceId, { icecastDelay: true, resumeFromSec });
      return;
    }

    await mopidy.play();
    try {
      await pushCurrentTrackToUpnp(deviceId, { icecastDelay: true });
    } catch (err) {
      const recovered = await ensureUpnpPipeline(true);
      if (!recovered) throw err;
      await pushCurrentTrackToUpnp(deviceId, { icecastDelay: true });
    }
  }
  async function play() {
    if (remote.isRemoteMode.value) return mopidy.play();
    try {
      if (isUpnpMode.value && selectedDeviceId.value) {
        await playOnUpnp(selectedDeviceId.value);
        return;
      } else if (isLocalPlayback.value) {
        await invoke('set_local_loopback_mute', { mute: false }).catch((err) => console.warn('Failed to unmute local loopback:', err));
        if (!pipelineReady.value) {
          await ensureUpnpPipeline(false).catch(() => {});
        }
      }
      await mopidy.play();
    } catch (err) {
      console.error('Playback Error:', err);
    }
  }
  async function playUris(uris: string[]) {
    try {
      clearPauseAtEndOfTrack();
      await mopidy.clear();
      await mopidy.add(uris);
      await play();
    } catch (err) {
      console.error('Play URIs Error:', err);
    }
  }
  function clearPauseAtEndOfTrack() {
    pauseAtEndOfTrack.value = false;
    pauseAtEndTlid.value = null;
    if (pauseAtEndPollId) {
      clearInterval(pauseAtEndPollId);
      pauseAtEndPollId = null;
    }
  }
  function cancelPauseAtEndOfTrack() {
    clearPauseAtEndOfTrack();
  }
  async function getPlaybackPositionMs(): Promise<number> {
    if (isUpnpMode.value && selectedDeviceId.value) {
      await upnp.refreshStatus(selectedDeviceId.value);
      return upnp.displayPositionSec.value * 1000;
    }
    return mopidy.position.value;
  }
  async function executePausePlayback() {
    if (remote.isRemoteMode.value) {
      await mopidy.pause();
      return;
    }
    await mopidy.pause();
    if (isLocalPlayback.value) {
      await stopTestSound();
    } else if (isUpnpMode.value && selectedDeviceId.value) {
      await upnp.pause(selectedDeviceId.value);
    }
  }
  async function checkPauseAtEnd() {
    if (!pauseAtEndOfTrack.value || pauseAtEndTlid.value == null) return;

    await mopidy.refreshState();

    const track = mopidy.currentTrack.value;
    if (!track) return;

    if (track.tlid !== pauseAtEndTlid.value) {
      clearPauseAtEndOfTrack();
      await executePausePlayback();
      return;
    }

    const length = track.track?.length ?? 0;
    const positionMs = await getPlaybackPositionMs();
    let effectiveLengthMs = length;

    if (effectiveLengthMs <= 0 && isUpnpMode.value) {
      const durationSec = timeToSeconds(upnp.positionInfo.value.trackDuration);
      if (durationSec > 0) {
        effectiveLengthMs = durationSec * 1000;
      }
    }

    if (effectiveLengthMs > 0 && positionMs >= effectiveLengthMs - PAUSE_AT_END_THRESHOLD_MS) {
      clearPauseAtEndOfTrack();
      await executePausePlayback();
      return;
    }

    if (mopidy.currentState.value.state === 'stopped') {
      clearPauseAtEndOfTrack();
      await executePausePlayback();
    }
  }
  function startPauseAtEndPolling() {
    if (pauseAtEndPollId) return;
    void checkPauseAtEnd();
    pauseAtEndPollId = setInterval(() => {
      void checkPauseAtEnd();
    }, PAUSE_AT_END_POLL_MS);
  }
  function togglePauseAtEndOfTrack() {
    if (pauseAtEndOfTrack.value) {
      cancelPauseAtEndOfTrack();
      return;
    }

    const tlid = mopidy.currentTrack.value?.tlid;
    if (tlid == null) return;

    pauseAtEndOfTrack.value = true;
    pauseAtEndTlid.value = tlid;
    startPauseAtEndPolling();
  }
  async function pause() {
    clearPauseAtEndOfTrack();
    await executePausePlayback();
  }
  async function togglePlayPause() {
    if (isPlaying.value) await pause();
    else await play();
  }
  async function next() {
    clearPauseAtEndOfTrack();
    await mopidy.next();
  }
  async function previous() {
    clearPauseAtEndOfTrack();
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
    clearPauseAtEndOfTrack();
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
        try {
          await playOnUpnp(newId);
        } catch (err) {
          console.error('UPnP device switch error:', err);
        }
      } else if (newId === 'local' && oldId) {
        await invoke('set_local_loopback_mute', { mute: false }).catch((err) => console.warn('Failed to unmute local loopback:', err));
        await upnp.stop(oldId);
      }
    });
    watch(
      () => mopidy.currentTrack.value?.tlid,
      async (tlid, oldTlid) => {
        if (tlid == null || oldTlid == null || tlid === oldTlid) return;
        if (!selectedDeviceId.value || selectedDeviceId.value === LOCAL_DEVICE_ID) return;
        if (!mopidy.isPlaying.value) return;

        try {
          await invoke('set_local_loopback_mute', { mute: true }).catch((err) => console.warn('Failed to mute local loopback:', err));
          const ready = await ensureUpnpPipeline(false);
          if (!ready) {
            await ensureUpnpPipeline(true);
          }
          await syncUpnpOnTrackChange(selectedDeviceId.value);
        } catch (err) {
          console.error('UPnP track change sync error:', err);
        }
      },
    );
  }
  return {
    isPlaying,
    isDevicePlaying,
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
    pauseAtEndOfTrack: readonly(pauseAtEndOfTrack),
    togglePauseAtEndOfTrack,
    cancelPauseAtEndOfTrack,
    refresh: mopidy.refreshState,
  };
}
