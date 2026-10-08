import type { ComputedRef, Ref } from 'vue';
import type { RendererStatus } from './useLocalRenderer';
import type { PreparedSource, StreamFormat, StreamSource } from '~/utils/directStream';
import type { QueueItem } from '~/utils/playQueue';
import { invoke } from '@tauri-apps/api/core';
import { computed, effectScope, ref, shallowRef, watch } from 'vue';
import { buildStreamUrl, getStreamSource, parseStreamUri } from '~/utils/directStream';
import { timeToSeconds } from '~/utils/time';
import { LOCAL_DEVICE_ID } from './useDevices';
import useLocalRenderer from './useLocalRenderer';
import usePlayQueue from './usePlayQueue';
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

export type PlaybackState = 'playing' | 'paused' | 'stopped';

const DIRECT_START_TIMEOUT_MS = 15000;
const NATURAL_END_MARGIN_SEC = 3;
const FORMAT_MIME: Record<StreamFormat, string> = { flac: 'audio/flac', mp3: 'audio/mpeg' };
const FLAC_MIMES = ['audio/flac', 'audio/x-flac'];

const directDeviceId = ref<string | null>(null);
const playingTlid = ref<number | null>(null);
const playingItemCache = shallowRef<QueueItem | null>(null);
const startOffsetSec = ref(0);
const anchorAt = ref(Number.POSITIVE_INFINITY);
const pending = ref<{ tlid: number, startSec: number, acked: boolean } | null>(null);
const pausedAtSec = ref<number | null>(null);
const stopAfterCurrent = ref(false);
const lastError = ref<string | null>(null);
let lastRelSec = -1;
let lastTrackUri = '';
let nextQueuedTlid: number | null | undefined;
let baseUrl: string | null = null;
let watchersRegistered = false;
let startRequestId = 0;
let currentIndexHint = -1;
const deviceFormats = new Map<string, StreamFormat>();

function buildMeta(item: QueueItem, format: StreamFormat): DirectTrackMeta {
  const track = item.track;
  return {
    title: track.name || 'Unknown',
    artist: track.artists?.[0]?.name,
    album: track.album?.name,
    durationSec: track.length ? track.length / 1000 : undefined,
    mime: FORMAT_MIME[format],
  };
}

function hasStreamSource(item?: QueueItem) {
  return getStreamSource(item?.track.uri) != null;
}

function findPlayable(list: QueueItem[], fromIndex: number, step: 1 | -1) {
  for (let index = fromIndex; index >= 0 && index < list.length; index += step) {
    if (hasStreamSource(list[index])) return list[index];
  }
  return undefined;
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
  const queue = usePlayQueue();
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
  const state = computed<PlaybackState>(() => {
    if (!isActive.value) return 'stopped';
    return isPaused.value ? 'paused' : 'playing';
  });

  const positionSec = computed(() => {
    if (!isActive.value) return 0;
    if (pending.value) return pending.value.startSec;
    if (pausedAtSec.value != null) return pausedAtSec.value;
    const renderer = adapter();
    const status = renderer.status.value;
    if (status.state === 'PLAYING' && Number.isFinite(anchorAt.value)) {
      void renderer.tick.value;
      return startOffsetSec.value + (performance.now() - anchorAt.value) / 1000;
    }
    const parsed = parseStreamUri(status.trackUri);
    const matchesCurrent = parsed?.tlid === playingTlid.value
      && Math.abs(parsed.startSec - startOffsetSec.value) < 0.01;
    if (!matchesCurrent) return startOffsetSec.value;
    return startOffsetSec.value + status.positionSec;
  });

  function findItem(tlid: number | null) {
    if (tlid == null) return undefined;
    return queue.items.value.find((item) => item.tlid === tlid);
  }

  const playingItem = computed(() => {
    if (!isActive.value) return null;
    return findItem(playingTlid.value) ?? playingItemCache.value;
  });

  function resolveCurrentIndex() {
    const index = queue.items.value.findIndex((item) => item.tlid === playingTlid.value);
    const item = queue.items.value[index];
    if (item) {
      currentIndexHint = index;
      playingItemCache.value = item;
    }
    return index;
  }

  function getNextItem() {
    const list = queue.items.value;
    const index = resolveCurrentIndex();
    if (index >= 0) return findPlayable(list, index + 1, 1);
    return currentIndexHint >= 0 ? findPlayable(list, currentIndexHint, 1) : undefined;
  }

  function getPreviousItem() {
    const list = queue.items.value;
    const index = resolveCurrentIndex();
    if (index >= 0) return findPlayable(list, index - 1, -1) ?? list[index];
    return findPlayable(list, currentIndexHint - 1, -1) ?? findPlayable(list, 0, 1);
  }

  function endSession() {
    startRequestId++;
    directDeviceId.value = null;
    playingTlid.value = null;
    playingItemCache.value = null;
    pending.value = null;
    pausedAtSec.value = null;
    stopAfterCurrent.value = false;
    anchorAt.value = Number.POSITIVE_INFINITY;
    lastTrackUri = '';
    lastRelSec = -1;
    nextQueuedTlid = undefined;
    currentIndexHint = -1;
  }

  async function stop() {
    const deviceId = directDeviceId.value;
    endSession();
    if (!deviceId) return;
    try {
      await adapterFor(deviceId).stop(deviceId);
    } catch (err) {
      console.error('Renderer stop error:', err);
    }
  }

  function fail(err: unknown) {
    console.error('Direct playback error:', err);
    lastError.value = err instanceof Error ? err.message : String(err);
    stop().catch((stopErr) => console.error('Direct playback stop error:', stopErr));
  }

  async function queueNext() {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    const renderer = adapterFor(deviceId);
    const next = stopAfterCurrent.value ? undefined : getNextItem();
    const nextSource = getStreamSource(next?.track.uri);
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
    const lengthMs = playingItem.value?.track.length;
    // Renderers often reset their position once stopped, so the anchored clock is the better end-of-track signal
    const clockSec = Number.isFinite(anchorAt.value)
      ? startOffsetSec.value + (performance.now() - anchorAt.value) / 1000
      : 0;
    const endedNaturally = !!lengthMs
      && Math.max(positionSec.value, clockSec) >= lengthMs / 1000 - NATURAL_END_MARGIN_SEC;
    const nextItem = endedNaturally ? getNextItem() : undefined;
    if (nextItem && !stopAfterCurrent.value) {
      void restartAt(nextItem, 0);
      return;
    }
    if (nextItem) queue.setCurrent(nextItem.tlid);
    void stop();
  }

  function syncFromDevice() {
    if (!isActive.value) return;
    const { state: rendererState, trackUri, positionSec: rel } = adapter().status.value;
    const parsed = parseStreamUri(trackUri);
    const now = performance.now();

    const request = pending.value;
    if (request) {
      const started = request.acked
        && parsed?.tlid === request.tlid
        && Math.abs(parsed.startSec - request.startSec) < 0.01
        && rendererState === 'PLAYING';
      if (!started) return;
      pending.value = null;
    }

    if (pausedAtSec.value != null) return;

    if (rendererState === 'STOPPED') {
      handleDeviceStopped();
      return;
    }

    if (!parsed) return;

    if (trackUri !== lastTrackUri) {
      if (stopAfterCurrent.value && lastTrackUri && parsed.tlid !== playingTlid.value) {
        queue.setCurrent(parsed.tlid);
        void stop();
        return;
      }
      lastTrackUri = trackUri;
      playingTlid.value = parsed.tlid;
      playingItemCache.value = findItem(parsed.tlid) ?? null;
      queue.setCurrent(parsed.tlid);
      resolveCurrentIndex();
      startOffsetSec.value = parsed.startSec;
      anchorAt.value = Number.POSITIVE_INFINITY;
      lastRelSec = rel;
      void queueNext();
    }

    if (rendererState === 'PLAYING' && rel !== lastRelSec && rel > 0) {
      // Renderer positions may be coarse (UPnP RelTime is whole seconds), so each change only bounds the start from above
      anchorAt.value = Math.min(anchorAt.value, now - rel * 1000);
    }
    lastRelSec = rel;
  }

  async function startTrack(deviceId: string, item: QueueItem, startSec = 0) {
    const source = getStreamSource(item.track.uri);
    if (!source) throw new Error(`No direct stream source: ${item.track.uri}`);

    const renderer = adapterFor(deviceId);
    const requestId = ++startRequestId;
    const isCurrentRequest = () => requestId === startRequestId && pending.value != null;
    directDeviceId.value = deviceId;
    playingTlid.value = item.tlid;
    playingItemCache.value = item;
    queue.setCurrent(item.tlid);
    startOffsetSec.value = startSec;
    pending.value = { tlid: item.tlid, startSec, acked: false };
    pausedAtSec.value = null;
    lastTrackUri = '';
    nextQueuedTlid = undefined;
    anchorAt.value = Number.POSITIVE_INFINITY;
    currentIndexHint = -1;
    lastError.value = null;
    resolveCurrentIndex();

    try {
      const [prepared, format, base] = await Promise.all([
        prepareSource(source),
        getStreamFormat(deviceId),
        getBaseUrl(),
      ]);
      if (!isCurrentRequest()) return;
      await renderer.play(deviceId, buildStreamUrl(base, item.tlid, prepared, startSec, format), buildMeta(item, format));
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
        if (requestId === startRequestId && pending.value === request) fail(new Error('Playback start timed out'));
      }, DIRECT_START_TIMEOUT_MS);
    } catch (err) {
      if (requestId !== startRequestId) return;
      throw err;
    }
  }

  async function startItem(deviceId: string, item: QueueItem, startSec: number) {
    try {
      await startTrack(deviceId, item, startSec);
    } catch (err) {
      fail(err);
    }
  }

  async function restartAt(item: QueueItem, startSec: number) {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    await startItem(deviceId, item, startSec);
  }

  async function start(deviceId: string, tlid: number, startSec = 0) {
    const item = findItem(tlid);
    if (!item) return;
    await startItem(deviceId, item, startSec);
  }

  async function pause() {
    const deviceId = directDeviceId.value;
    if (!deviceId) return;
    startRequestId++;
    pausedAtSec.value = positionSec.value;
    pending.value = null;
    await adapterFor(deviceId).pause(deviceId);
  }

  async function resume() {
    const item = playingItem.value;
    if (!item) return;
    await restartAt(item, pausedAtSec.value ?? 0);
  }

  async function seek(sec: number) {
    const target = Math.max(0, sec);
    if (pausedAtSec.value != null) {
      pausedAtSec.value = target;
      return;
    }
    const item = playingItem.value;
    if (!item) return;
    await restartAt(item, target);
  }

  async function next() {
    const target = getNextItem();
    if (!target) {
      await stop();
      return;
    }
    await restartAt(target, 0);
  }

  async function previous() {
    const target = getPreviousItem();
    if (!target) return;
    await restartAt(target, 0);
  }

  if (import.meta.client && !watchersRegistered) {
    watchersRegistered = true;
    effectScope(true).run(() => {
      watch([upnp.positionInfo, upnp.currentUpnpState, local.status], () => syncFromDevice(), { flush: 'sync' });
      watch(
        [() => queue.items.value.map((item) => item.tlid).join(','), stopAfterCurrent],
        () => {
          if (isActive.value && !pending.value) void queueNext();
        },
      );
    });
  }

  return {
    deviceId: computed(() => directDeviceId.value),
    isActive,
    isPaused,
    isDevicePlaying,
    state,
    positionSec,
    playingItem,
    stopAfterCurrent,
    lastError,
    start,
    pause,
    resume,
    seek,
    next,
    previous,
    stop,
  };
}
