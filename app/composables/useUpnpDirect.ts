import type { MopidyTlTrack } from './useMopidy';
import { invoke } from '@tauri-apps/api/core';
import { computed, ref, watch } from 'vue';
import { buildStreamUrl, canPlayDirect, getTidalTrackId, parseStreamUri } from '~/utils/directStream';
import { timeToSeconds } from '~/utils/time';
import useMopidy from './useMopidy';
import useUpnpPlayer from './useUpnpPlayer';

interface DirectTrackMeta {
  title: string
  artist?: string
  album?: string
  durationSec?: number
}

type FailureHandler = (deviceId: string, tlid: number, startSec: number) => Promise<void>;

const DIRECT_START_TIMEOUT_MS = 15000;
const NATURAL_END_MARGIN_SEC = 3;

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
let currentIndexHint = -1;
let currentTlTrackCache: MopidyTlTrack | null = null;

function buildMeta(tlTrack: MopidyTlTrack): DirectTrackMeta {
  const track = tlTrack.track;
  return {
    title: track.name || 'Unknown',
    artist: track.artists?.[0]?.name,
    album: track.album?.name,
    durationSec: track.length ? track.length / 1000 : undefined,
  };
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

  function resolveCurrentIndex(list: MopidyTlTrack[]) {
    const index = list.findIndex((item) => item.tlid === currentTlid.value);
    const item = list[index];
    if (item) {
      currentIndexHint = index;
      currentTlTrackCache = item;
    }
    return index;
  }

  function getNextItem(list: MopidyTlTrack[]) {
    const index = resolveCurrentIndex(list);
    if (index >= 0) return list[index + 1];
    return currentIndexHint >= 0 ? list[currentIndexHint] : undefined;
  }

  function getPreviousItem(list: MopidyTlTrack[]) {
    const index = resolveCurrentIndex(list);
    if (index >= 0) return index > 0 ? list[index - 1] : list[index];
    return list[currentIndexHint - 1] ?? list[0];
  }

  function publishState() {
    if (!isActive.value) return;
    mopidy.setPlaybackOverride({
      state: isPaused.value ? 'paused' : 'playing',
      time_position: Math.round(positionSec.value * 1000),
      track: findTlTrack(currentTlid.value) ?? currentTlTrackCache,
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
    currentIndexHint = -1;
    currentTlTrackCache = null;
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
    const startSec = pending.value?.startSec ?? pausedAtSec.value ?? positionSec.value;
    endSession();
    if (!deviceId || tlid == null) return;
    try {
      await failureHandler?.(deviceId, tlid, startSec);
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
    const next = getNextItem(mopidy.tracklist.value);
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

  function handleDeviceStopped() {
    const lengthMs = (findTlTrack(currentTlid.value) ?? currentTlTrackCache)?.track?.length;
    // Renderers often reset RelTime once stopped, so the local clock is the better end-of-track signal
    const clockSec = Number.isFinite(anchorAt.value)
      ? startOffsetSec.value + (performance.now() - anchorAt.value) / 1000
      : 0;
    const endedNaturally = !!lengthMs
      && Math.max(positionSec.value, clockSec) >= lengthMs / 1000 - NATURAL_END_MARGIN_SEC;
    const nextItem = endedNaturally ? getNextItem(mopidy.tracklist.value) : undefined;
    if (nextItem && getTidalTrackId(nextItem.track?.uri)) {
      void restartAt(nextItem, 0);
      return;
    }
    void stop();
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
      handleDeviceStopped();
      return;
    }

    if (!parsed) {
      publishState();
      return;
    }

    if (trackUri !== lastTrackUri) {
      lastTrackUri = trackUri;
      currentTlid.value = parsed.tlid;
      currentTlTrackCache = findTlTrack(parsed.tlid) ?? null;
      resolveCurrentIndex(mopidy.tracklist.value);
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
    currentTlTrackCache = tlTrack;
    currentIndexHint = -1;
    resolveCurrentIndex(mopidy.tracklist.value);
    publishState();

    try {
      await mopidy.mopidyRpc('core.playback.stop').catch(() => {});
      const base = await getBaseUrl();
      await invoke('tidal_prepare_stream', { trackId });
      if (!isCurrentRequest()) return;
      await invoke('upnp_play_direct', {
        deviceId,
        uri: buildStreamUrl(base, tlTrack.tlid, trackId, startSec),
        meta: buildMeta(tlTrack),
      });
      if (requestId !== startRequestId) {
        // The Pause SOAP may have reached the device before this Play
        if (pausedAtSec.value != null && directDeviceId.value === deviceId) await upnp.pause(deviceId);
        return;
      }
      const request = pending.value;
      if (!request) return;
      request.acked = true;
      upnp.ensureStatusPolling(deviceId);
      setTimeout(() => {
        if (requestId === startRequestId && pending.value === request) void handleStartFailure();
      }, DIRECT_START_TIMEOUT_MS);
    } catch (err) {
      if (requestId !== startRequestId) return;
      throw err;
    }
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
    startRequestId++;
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
    const target = getNextItem(mopidy.tracklist.value);
    if (!target) {
      await stop();
      return;
    }
    await restartAt(target, 0);
  }

  async function previous() {
    const target = getPreviousItem(mopidy.tracklist.value);
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
