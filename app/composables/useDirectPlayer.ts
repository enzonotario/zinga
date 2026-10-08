import type { ComputedRef, Ref } from 'vue';
import type { RendererStatus } from './useLocalRenderer';
import type { MopidyTlTrack } from './useMopidy';
import type { PreparedSource, StreamFormat, StreamSource } from '~/utils/directStream';
import { invoke } from '@tauri-apps/api/core';
import { computed, ref, watch } from 'vue';
import { buildStreamUrl, canPlayDirect, getStreamSource, parseStreamUri } from '~/utils/directStream';
import { timeToSeconds } from '~/utils/time';
import { LOCAL_DEVICE_ID } from './useDevices';
import useLocalRenderer from './useLocalRenderer';
import useMopidy from './useMopidy';
import useUpnpPlayer from './useUpnpPlayer';

interface DirectTrackMeta {
  title: string
  artist?: string
  album?: string
  durationSec?: number
  mime?: string
}

interface RendererAdapter {
  status: ComputedRef<RendererStatus>
  tick: Ref<number>
  play: (deviceId: string, uri: string, meta: DirectTrackMeta) => Promise<void>
  setNext: (deviceId: string, uri: string | null, meta: DirectTrackMeta | null) => Promise<void>
  pause: (deviceId: string) => Promise<void>
  stop: (deviceId: string) => Promise<void>
  ensurePolling: (deviceId: string) => void
}

type FailureHandler = (deviceId: string, tlid: number, startSec: number) => Promise<void>;

const DIRECT_START_TIMEOUT_MS = 15000;
const NATURAL_END_MARGIN_SEC = 3;
const FORMAT_MIME: Record<StreamFormat, string> = { flac: 'audio/flac', mp3: 'audio/mpeg' };
const FLAC_MIMES = ['audio/flac', 'audio/x-flac'];

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
const deviceFormats = new Map<string, StreamFormat>();

function buildMeta(tlTrack: MopidyTlTrack, format: StreamFormat): DirectTrackMeta {
  const track = tlTrack.track;
  return {
    title: track.name || 'Unknown',
    artist: track.artists?.[0]?.name,
    album: track.album?.name,
    durationSec: track.length ? track.length / 1000 : undefined,
    mime: FORMAT_MIME[format],
  };
}

async function getBaseUrl() {
  baseUrl ??= await invoke<string>('direct_stream_base_url');
  return baseUrl;
}

async function prepareSource(source: StreamSource): Promise<PreparedSource> {
  if (source.kind === 'tidal') {
    await invoke('tidal_prepare_stream', { trackId: source.id });
    return source;
  }
  const token = await invoke<string>('direct_register_file', { path: source.path });
  return { kind: 'file', token };
}

async function getStreamFormat(deviceId: string): Promise<StreamFormat> {
  if (deviceId === LOCAL_DEVICE_ID) return 'flac';
  const cached = deviceFormats.get(deviceId);
  if (cached) return cached;
  try {
    const protocols = await invoke<string[]>('upnp_get_sink_protocols', { deviceId });
    const format = protocols.some((protocol) => FLAC_MIMES.some((mime) => protocol.includes(mime))) ? 'flac' : 'mp3';
    deviceFormats.set(deviceId, format);
    return format;
  } catch (err) {
    console.warn('Failed to read renderer protocols, assuming FLAC:', err);
    return 'flac';
  }
}

export default function useDirectPlayer() {
  const mopidy = useMopidy();
  const upnp = useUpnpPlayer();
  const local = useLocalRenderer();

  const upnpAdapter: RendererAdapter = {
    status: computed(() => ({
      state: upnp.currentUpnpState.value.trim().toUpperCase(),
      trackUri: upnp.positionInfo.value.trackUri ?? '',
      positionSec: timeToSeconds(upnp.positionInfo.value.relTime),
    })),
    tick: upnp.uiTick,
    play: async (deviceId, uri, meta) => {
      await invoke('upnp_play_direct', { deviceId, uri, meta });
    },
    setNext: async (deviceId, uri, meta) => {
      await invoke('upnp_set_next_direct', { deviceId, uri: uri ?? '', meta });
    },
    pause: async (deviceId) => {
      await upnp.pause(deviceId);
    },
    stop: async (deviceId) => {
      await upnp.stop(deviceId);
    },
    ensurePolling: (deviceId) => upnp.ensureStatusPolling(deviceId),
  };

  const localAdapter: RendererAdapter = {
    status: computed(() => local.status.value),
    tick: local.tick,
    play: (_deviceId, uri) => local.play(uri),
    setNext: (_deviceId, uri) => local.setNext(uri),
    pause: () => local.pause(),
    stop: () => local.stop(),
    ensurePolling: () => local.ensurePolling(),
  };

  function adapterFor(deviceId: string | null) {
    return deviceId === LOCAL_DEVICE_ID ? localAdapter : upnpAdapter;
  }

  function adapter() {
    return adapterFor(directDeviceId.value);
  }

  const isActive = computed(() => directDeviceId.value != null);
  const isPaused = computed(() => pausedAtSec.value != null);
  const isDevicePlaying = computed(() =>
    isActive.value && !pending.value && !isPaused.value && adapter().status.value.state === 'PLAYING',
  );

  const positionSec = computed(() => {
    if (pending.value) return pending.value.startSec;
    if (pausedAtSec.value != null) return pausedAtSec.value;
    const renderer = adapter();
    const status = renderer.status.value;
    if (status.state === 'PLAYING' && Number.isFinite(anchorAt.value)) {
      void renderer.tick.value;
      return startOffsetSec.value + (performance.now() - anchorAt.value) / 1000;
    }
    const parsed = parseStreamUri(status.trackUri);
    const matchesCurrent = parsed?.tlid === currentTlid.value
      && Math.abs(parsed.startSec - startOffsetSec.value) < 0.01;
    if (!matchesCurrent) return startOffsetSec.value;
    return startOffsetSec.value + status.positionSec;
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
    if (deviceId) await adapterFor(deviceId).stop(deviceId);
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
      console.error('Direct playback fallback error:', err);
    }
  }

  function setFailureHandler(handler: FailureHandler | null) {
    failureHandler = handler;
  }

  async function queueNext() {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    const renderer = adapterFor(deviceId);
    const next = getNextItem(mopidy.tracklist.value);
    const nextSource = getStreamSource(next?.track?.uri);
    const targetTlid = next && nextSource ? next.tlid : null;
    if (targetTlid === nextQueuedTlid) return;
    nextQueuedTlid = targetTlid;
    try {
      if (!next || !nextSource) {
        await renderer.setNext(deviceId, null, null);
        return;
      }
      const [prepared, format, base] = await Promise.all([
        prepareSource(nextSource),
        getStreamFormat(deviceId),
        getBaseUrl(),
      ]);
      if (directDeviceId.value !== deviceId || nextQueuedTlid !== targetTlid) return;
      await renderer.setNext(deviceId, buildStreamUrl(base, next.tlid, prepared, 0, format), buildMeta(next, format));
    } catch (err) {
      if (nextQueuedTlid === targetTlid) nextQueuedTlid = undefined;
      console.error('Direct playback next track error:', err);
    }
  }

  function handleDeviceStopped() {
    const lengthMs = (findTlTrack(currentTlid.value) ?? currentTlTrackCache)?.track?.length;
    // Renderers often reset their position once stopped, so the anchored clock is the better end-of-track signal
    const clockSec = Number.isFinite(anchorAt.value)
      ? startOffsetSec.value + (performance.now() - anchorAt.value) / 1000
      : 0;
    const endedNaturally = !!lengthMs
      && Math.max(positionSec.value, clockSec) >= lengthMs / 1000 - NATURAL_END_MARGIN_SEC;
    const nextItem = endedNaturally ? getNextItem(mopidy.tracklist.value) : undefined;
    if (nextItem && getStreamSource(nextItem.track?.uri)) {
      void restartAt(nextItem, 0);
      return;
    }
    const deviceId = directDeviceId.value;
    if (!nextItem || !deviceId || !failureHandler) {
      void stop();
      return;
    }
    endSession();
    void failureHandler(deviceId, nextItem.tlid, 0).catch((err) => {
      console.error('Direct playback hand-off error:', err);
    });
  }

  function syncFromDevice() {
    if (!isActive.value) return;
    const { state, trackUri, positionSec: rel } = adapter().status.value;
    const parsed = parseStreamUri(trackUri);
    const now = performance.now();

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
      // Renderer positions may be coarse (UPnP RelTime is whole seconds), so each change only bounds the start from above
      anchorAt.value = Math.min(anchorAt.value, now - rel * 1000);
    }
    lastRelSec = rel;
    publishState();
  }

  async function startTrack(deviceId: string, tlTrack: MopidyTlTrack, startSec = 0) {
    const source = getStreamSource(tlTrack.track?.uri);
    if (!source) throw new Error(`No direct stream source: ${tlTrack.track?.uri}`);

    const renderer = adapterFor(deviceId);
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
      const [prepared, format, base] = await Promise.all([
        prepareSource(source),
        getStreamFormat(deviceId),
        getBaseUrl(),
      ]);
      if (!isCurrentRequest()) return;
      await renderer.play(deviceId, buildStreamUrl(base, tlTrack.tlid, prepared, startSec, format), buildMeta(tlTrack, format));
      if (requestId !== startRequestId) {
        // The pause may have reached the renderer before this play
        if (pausedAtSec.value != null && directDeviceId.value === deviceId) await renderer.pause(deviceId);
        return;
      }
      const request = pending.value;
      if (!request) return;
      request.acked = true;
      renderer.ensurePolling(deviceId);
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
      console.error('Direct playback error:', err);
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
    await adapterFor(deviceId).pause(deviceId);
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
    watch([upnp.positionInfo, upnp.currentUpnpState, local.status], () => syncFromDevice(), { flush: 'sync' });
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
