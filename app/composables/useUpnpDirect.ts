import type { MopidyTlTrack } from './useMopidy';
import { invoke } from '@tauri-apps/api/core';
import { computed, ref, watch } from 'vue';
import { timeToSeconds } from '~/utils/time';
import useMopidy from './useMopidy';
import useUpnpPlayer from './useUpnpPlayer';

interface DirectTrackMeta {
  title: string
  artist?: string
  album?: string
  durationSec?: number
}

type FailureHandler = (deviceId: string, tlid: number) => Promise<void>;

const DIRECT_START_TIMEOUT_MS = 15000;
const STREAM_URI_PATTERN = /\/stream\/(\d+)\/\d+\.flac\?start=([\d.]+)/;

const directDeviceId = ref<string | null>(null);
const currentTlid = ref<number | null>(null);
const startOffsetSec = ref(0);
const anchorAt = ref(Number.POSITIVE_INFINITY);
const pending = ref<{ tlid: number, startSec: number, acked: boolean } | null>(null);
const pausedAtSec = ref<number | null>(null);
let lastRelSec = -1;
let lastTrackUri = '';
let nextQueuedTlid: number | null | undefined;
let baseUrl: string | null = null;
let failureHandler: FailureHandler | null = null;
let watchersRegistered = false;
let startRequestId = 0;

export function getTidalTrackId(uri?: string) {
  if (!uri?.startsWith('tidal:track:')) return null;
  const id = uri.split(':').pop();
  return id && /^\d+$/.test(id) ? id : null;
}

export function canPlayDirect(tracklist: MopidyTlTrack[]) {
  return tracklist.length > 0 && tracklist.every((item) => getTidalTrackId(item.track?.uri) != null);
}

export function parseStreamUri(uri?: string | null) {
  const match = uri?.match(STREAM_URI_PATTERN);
  if (!match) return null;
  return { tlid: Number(match[1]), startSec: Number(match[2]) };
}

function buildMeta(tlTrack: MopidyTlTrack): DirectTrackMeta {
  const track = tlTrack.track;
  return {
    title: track.name || 'Unknown',
    artist: track.artists?.[0]?.name,
    album: track.album?.name,
    durationSec: track.length ? track.length / 1000 : undefined,
  };
}

function buildStreamUrl(base: string, tlid: number, trackId: string, startSec: number) {
  return `${base}/stream/${tlid}/${trackId}.flac?start=${startSec.toFixed(3)}`;
}

async function getBaseUrl() {
  baseUrl ??= await invoke<string>('direct_stream_base_url');
  return baseUrl;
}

export default function useUpnpDirect() {
  const mopidy = useMopidy();
  const upnp = useUpnpPlayer();

  const deviceState = computed(() => upnp.currentUpnpState.value.trim().toUpperCase());
  const isActive = computed(() => directDeviceId.value != null);
  const isPaused = computed(() => pausedAtSec.value != null);
  const isDevicePlaying = computed(() =>
    isActive.value && !pending.value && !isPaused.value && deviceState.value === 'PLAYING',
  );

  const positionSec = computed(() => {
    if (pending.value) return pending.value.startSec;
    if (pausedAtSec.value != null) return pausedAtSec.value;
    if (deviceState.value === 'PLAYING' && Number.isFinite(anchorAt.value)) {
      void upnp.uiTick.value;
      return startOffsetSec.value + (performance.now() - anchorAt.value) / 1000;
    }
    const parsed = parseStreamUri(upnp.positionInfo.value.trackUri);
    const matchesCurrent = parsed?.tlid === currentTlid.value
      && Math.abs(parsed.startSec - startOffsetSec.value) < 0.01;
    if (!matchesCurrent) return startOffsetSec.value;
    return startOffsetSec.value + timeToSeconds(upnp.positionInfo.value.relTime);
  });

  function findTlTrack(tlid: number | null) {
    if (tlid == null) return undefined;
    return mopidy.tracklist.value.find((item) => item.tlid === tlid);
  }

  function publishState() {
    if (!isActive.value) return;
    mopidy.setPlaybackOverride({
      state: isPaused.value ? 'paused' : 'playing',
      time_position: Math.round(positionSec.value * 1000),
      track: findTlTrack(currentTlid.value) ?? null,
    });
  }

  function endSession() {
    startRequestId++;
    directDeviceId.value = null;
    currentTlid.value = null;
    pending.value = null;
    pausedAtSec.value = null;
    anchorAt.value = Number.POSITIVE_INFINITY;
    lastTrackUri = '';
    lastRelSec = -1;
    nextQueuedTlid = undefined;
    mopidy.setPlaybackOverride(null);
    void mopidy.refreshState();
  }

  async function stop() {
    const deviceId = directDeviceId.value;
    endSession();
    if (deviceId) await upnp.stop(deviceId);
  }

  function deactivate() {
    endSession();
  }

  async function handleStartFailure() {
    const deviceId = directDeviceId.value;
    const tlid = pending.value?.tlid ?? currentTlid.value;
    endSession();
    if (!deviceId || tlid == null) return;
    try {
      await failureHandler?.(deviceId, tlid);
    } catch (err) {
      console.error('Direct UPnP fallback error:', err);
    }
  }

  function setFailureHandler(handler: FailureHandler | null) {
    failureHandler = handler;
  }

  async function queueNext() {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    const list = mopidy.tracklist.value;
    const index = list.findIndex((item) => item.tlid === currentTlid.value);
    const next = index >= 0 ? list[index + 1] : undefined;
    const nextTrackId = getTidalTrackId(next?.track?.uri);
    const targetTlid = next && nextTrackId ? next.tlid : null;
    if (targetTlid === nextQueuedTlid) return;
    nextQueuedTlid = targetTlid;
    try {
      if (!next || !nextTrackId) {
        await invoke('upnp_set_next_direct', { deviceId, uri: '', meta: null });
        return;
      }
      await invoke('tidal_prepare_stream', { trackId: nextTrackId });
      const base = await getBaseUrl();
      if (directDeviceId.value !== deviceId || nextQueuedTlid !== targetTlid) return;
      await invoke('upnp_set_next_direct', {
        deviceId,
        uri: buildStreamUrl(base, next.tlid, nextTrackId, 0),
        meta: buildMeta(next),
      });
    } catch (err) {
      if (nextQueuedTlid === targetTlid) nextQueuedTlid = undefined;
      console.error('Direct UPnP next track error:', err);
    }
  }

  function syncFromDevice() {
    if (!isActive.value) return;
    const trackUri = upnp.positionInfo.value.trackUri ?? '';
    const parsed = parseStreamUri(trackUri);
    const rel = timeToSeconds(upnp.positionInfo.value.relTime);
    const now = performance.now();
    const state = deviceState.value;

    const request = pending.value;
    if (request) {
      const started = request.acked
        && parsed?.tlid === request.tlid
        && Math.abs(parsed.startSec - request.startSec) < 0.01
        && state === 'PLAYING';
      if (!started) {
        publishState();
        return;
      }
      pending.value = null;
    }

    if (pausedAtSec.value != null) {
      publishState();
      return;
    }

    if (state === 'STOPPED') {
      void stop();
      return;
    }

    if (!parsed) {
      publishState();
      return;
    }

    if (trackUri !== lastTrackUri) {
      lastTrackUri = trackUri;
      currentTlid.value = parsed.tlid;
      startOffsetSec.value = parsed.startSec;
      anchorAt.value = Number.POSITIVE_INFINITY;
      lastRelSec = rel;
      void queueNext();
    }

    if (state === 'PLAYING' && rel !== lastRelSec && rel > 0) {
      // RelTime has 1 s resolution, so each observed tick only bounds the real start from above
      anchorAt.value = Math.min(anchorAt.value, now - rel * 1000);
    }
    lastRelSec = rel;
    publishState();
  }

  async function startTrack(deviceId: string, tlTrack: MopidyTlTrack, startSec = 0) {
    const trackId = getTidalTrackId(tlTrack.track?.uri);
    if (!trackId) throw new Error(`Not a TIDAL track: ${tlTrack.track?.uri}`);

    const requestId = ++startRequestId;
    const isCurrentRequest = () => requestId === startRequestId && pending.value != null;
    directDeviceId.value = deviceId;
    currentTlid.value = tlTrack.tlid;
    startOffsetSec.value = startSec;
    pending.value = { tlid: tlTrack.tlid, startSec, acked: false };
    pausedAtSec.value = null;
    lastTrackUri = '';
    nextQueuedTlid = undefined;
    anchorAt.value = Number.POSITIVE_INFINITY;
    publishState();

    await mopidy.mopidyRpc('core.playback.stop').catch(() => {});
    const base = await getBaseUrl();
    await invoke('tidal_prepare_stream', { trackId });
    if (!isCurrentRequest()) return;
    await invoke('upnp_play_direct', {
      deviceId,
      uri: buildStreamUrl(base, tlTrack.tlid, trackId, startSec),
      meta: buildMeta(tlTrack),
    });
    const request = pending.value;
    if (requestId !== startRequestId || !request) return;
    request.acked = true;
    upnp.ensureStatusPolling(deviceId);
    setTimeout(() => {
      if (requestId === startRequestId && pending.value === request) void handleStartFailure();
    }, DIRECT_START_TIMEOUT_MS);
  }

  async function restartAt(tlTrack: MopidyTlTrack, startSec: number) {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    try {
      await startTrack(deviceId, tlTrack, startSec);
    } catch (err) {
      console.error('Direct UPnP playback error:', err);
      await handleStartFailure();
    }
  }

  async function pause() {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    pausedAtSec.value = positionSec.value;
    pending.value = null;
    publishState();
    await upnp.pause(deviceId);
  }

  async function resume() {
    const tlTrack = findTlTrack(currentTlid.value);
    if (!tlTrack) return;
    await restartAt(tlTrack, pausedAtSec.value ?? 0);
  }

  async function seek(sec: number) {
    const target = Math.max(0, sec);
    if (pausedAtSec.value != null) {
      pausedAtSec.value = target;
      publishState();
      return;
    }
    const tlTrack = findTlTrack(currentTlid.value);
    if (!tlTrack) return;
    await restartAt(tlTrack, target);
  }

  async function playTlid(tlid: number) {
    const tlTrack = findTlTrack(tlid);
    if (!tlTrack) return;
    await restartAt(tlTrack, 0);
  }

  async function next() {
    const list = mopidy.tracklist.value;
    const index = list.findIndex((item) => item.tlid === currentTlid.value);
    const target = list[index + 1];
    if (!target) {
      await stop();
      return;
    }
    await restartAt(target, 0);
  }

  async function previous() {
    const list = mopidy.tracklist.value;
    const index = list.findIndex((item) => item.tlid === currentTlid.value);
    const target = index > 0 ? list[index - 1] : list[index];
    if (!target) return;
    await restartAt(target, 0);
  }

  if (import.meta.client && !watchersRegistered) {
    watchersRegistered = true;
    watch([upnp.positionInfo, upnp.currentUpnpState], () => syncFromDevice(), { flush: 'sync' });
    watch(
      () => mopidy.tracklist.value.map((item) => item.tlid).join(','),
      () => {
        if (isActive.value && !pending.value) void queueNext();
      },
    );
  }

  return {
    isActive,
    isPaused,
    isDevicePlaying,
    positionSec,
    currentTlid,
    canPlayDirect,
    startTrack,
    pause,
    resume,
    seek,
    playTlid,
    next,
    previous,
    stop,
    deactivate,
    setFailureHandler,
  };
}
