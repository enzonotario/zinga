import type { QueueTrack } from '~/utils/playQueue';
import type { RemoteCreditGroup, RemotePlaybackStatus } from '~/utils/remoteSnapshot';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDebounceFn } from '@vueuse/core';
import { effectScope, ref, watch } from 'vue';
import { queueTracksFromRemote } from '~/utils/playQueue';
import { tidalTrackInfoToQueueTrack, toQueueTrack } from '~/utils/queueTracks';
import { buildDevicesSnapshot, buildPlaybackSnapshot, buildQueueSnapshot, groupRemoteCredits } from '~/utils/remoteSnapshot';
import { getTidalTrackInfo } from '~/utils/tidal';
import { currentPlaybackArtwork } from './useBottomBar';
import useDevices from './useDevices';
import useLyrics from './useLyrics';
import usePlayer from './usePlayer';
import usePlayQueue from './usePlayQueue';
import useProvider from './useProvider';
import useRemoteClient from './useRemoteClient';
import useRemoteServer from './useRemoteServer';
import useTidalAuth from './useTidalAuth';

type RemoteCommand
  = | { action: 'play' | 'pause' | 'pause_at_end' | 'next' | 'previous' | 'queue_clear' }
    | { action: 'seek', position: number }
    | { action: 'queue_add', uris: string[] }
    | { action: 'queue_remove', tlid: number }
    | { action: 'queue_replace', tracks: unknown, startIndex?: number }
    | { action: 'queue_play_album', albumId: string }
    | { action: 'select_device', deviceId: string }
    | { action: 'discover_devices' }
    | { action: 'set_volume', level: number };

const REMOTE_COMMAND_EVENT = 'remote-command';
const PUSH_DEBOUNCE_MS = 250;
const PUSH_MAX_WAIT_MS = 1000;
const PUSH_TIMEOUT_MS = 4000;
const COMMAND_TIMEOUT_MS = 20000;
const SERVER_RUNNING_CACHE_MS = 2000;

let bridgeRegistered = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export default function useRemoteHostBridge() {
  if (!import.meta.client || bridgeRegistered) return;
  bridgeRegistered = true;

  const remote = useRemoteClient();
  const server = useRemoteServer();
  const player = usePlayer();
  const queue = usePlayQueue();
  const provider = useProvider();
  const tidalAuth = useTidalAuth();
  const devices = useDevices();
  const lyricsState = useLyrics();
  const creditGroups = ref<RemoteCreditGroup[] | null>(null);
  let queueDirty = true;

  function tidalTrackId(uri?: string) {
    return uri?.match(/tidal:track:([^:/]+)/)?.[1] ?? null;
  }

  async function loadCredits(uri: string) {
    const id = tidalTrackId(uri);
    if (!id) {
      creditGroups.value = null;
      return;
    }
    try {
      creditGroups.value = groupRemoteCredits(await provider.getTrackCredits(id));
    } catch {
      creditGroups.value = null;
    }
  }
  let pendingCommand = Promise.resolve();
  let pushRunning = false;
  let pushQueued = false;
  let cachedServerRunning: { value: boolean, at: number } | null = null;

  function playbackStatus(): RemotePlaybackStatus {
    if (player.isPlaying.value) return 'playing';
    if (player.isPaused.value) return 'paused';
    return 'stopped';
  }

  async function hostServerRunning() {
    const now = Date.now();
    if (cachedServerRunning && now - cachedServerRunning.at < SERVER_RUNNING_CACHE_MS) {
      return cachedServerRunning.value;
    }
    try {
      const status = await withTimeout(
        invoke<{ running: boolean }>('remote_server_status'),
        1500,
        'remote_server_status',
      );
      cachedServerRunning = { value: status.running, at: now };
      return status.running;
    } catch {
      const fallback = server.isRunning.value;
      cachedServerRunning = { value: fallback, at: now };
      return fallback;
    }
  }

  function lyricsPayload() {
    const plain = lyricsState.lyrics.value;
    const synced = lyricsState.syncedLyrics.value;
    if (plain || synced) return { plain, synced };
    const track = player.currentItem.value?.track;
    const name = track?.name?.trim() ?? '';
    const artist = track?.artists?.[0]?.name?.trim() ?? '';
    if (!name || !artist) return null;
    if (lyricsState.loading.value || !lyricsState.error.value) return { plain: null, synced: null, status: 'loading' as const };
    return { plain: null, synced: null, status: 'missing' as const };
  }

  async function pushOnce() {
    if (remote.isRemoteMode.value || !await hostServerRunning()) return;
    const includeQueue = queueDirty;
    queueDirty = false;
    try {
      await withTimeout(
        invoke('remote_broadcast_state', {
          playback: buildPlaybackSnapshot(playbackStatus(), player.position.value, player.currentItem.value ?? queue.items.value[0] ?? null, currentPlaybackArtwork(player.currentItem.value?.track), lyricsPayload(), creditGroups.value, queue.items.value.length > 0, player.pauseAtEndOfTrack.value),
          queue: includeQueue ? buildQueueSnapshot(queue.items.value) : null,
          devices: buildDevicesSnapshot(devices.devices.value, devices.selectedDeviceId.value, devices.volume.value),
        }),
        PUSH_TIMEOUT_MS,
        'remote_broadcast_state',
      );
    } catch (err) {
      queueDirty ||= includeQueue;
      console.error('Remote state push error:', err);
    }
  }

  async function drainPush() {
    if (pushRunning) {
      pushQueued = true;
      return;
    }
    pushRunning = true;
    try {
      do {
        pushQueued = false;
        await pushOnce();
      } while (pushQueued);
    } finally {
      pushRunning = false;
      if (pushQueued) void drainPush();
    }
  }

  function enqueuePush() {
    void drainPush();
  }

  const schedulePush = useDebounceFn(enqueuePush, PUSH_DEBOUNCE_MS, { maxWait: PUSH_MAX_WAIT_MS });

  async function resolveTrackUris(uris: string[]) {
    const infos = await Promise.all(uris.map((uri) => getTidalTrackInfo(uri, 'US', tidalAuth).catch(() => null)));
    return infos.map((info) => tidalTrackInfoToQueueTrack(info)).filter((track): track is QueueTrack => track !== null);
  }

  async function loadAlbumTracks(albumId: string) {
    const [album, tracks] = await Promise.all([provider.getAlbum(albumId), provider.getAlbumTracks(albumId)]);
    return tracks.map((track) => toQueueTrack(track, album));
  }

  async function execute(command: RemoteCommand) {
    if (remote.isRemoteMode.value) return;
    switch (command.action) {
      case 'play':
        return player.play();
      case 'pause':
        return player.pause();
      case 'pause_at_end':
        player.togglePauseAtEndOfTrack();
        return;
      case 'next':
        return player.next();
      case 'previous':
        return player.previous();
      case 'seek':
        return player.seek(command.position / 1000);
      case 'queue_clear':
        return player.clear();
      case 'queue_remove':
        queue.remove(command.tlid);
        return;
      case 'queue_add':
        return player.addTracks(await resolveTrackUris(command.uris));
      case 'queue_replace': {
        const tracks = queueTracksFromRemote(command.tracks);
        if (!tracks.length) return;
        return player.playTracks(tracks, command.startIndex ?? 0);
      }
      case 'queue_play_album':
        return player.playTracks(await loadAlbumTracks(command.albumId));
      case 'select_device':
        return devices.select(command.deviceId);
      case 'discover_devices':
        return devices.discover();
      case 'set_volume':
        await devices.setVolume(command.level);
        enqueuePush();
    }
  }

  effectScope(true).run(() => {
    watch(queue.items, () => {
      queueDirty = true;
      schedulePush();
    });
    watch(
      () => {
        const artwork = currentPlaybackArtwork(player.currentItem.value?.track);
        return [playbackStatus(), player.currentItem.value?.tlid, Math.floor(player.position.value), artwork.coverUrl, artwork.artistPicture, lyricsState.lyrics.value, lyricsState.syncedLyrics.value, creditGroups.value, player.pauseAtEndOfTrack.value];
      },
      () => schedulePush(),
    );
    watch(
      () => player.currentItem.value?.track?.uri ?? '',
      (uri) => {
        void loadCredits(uri);
      },
      { immediate: true },
    );
    watch(
      () => {
        if (remote.isRemoteMode.value) return '';
        const track = player.currentItem.value?.track;
        const name = track?.name?.trim() ?? '';
        const artist = track?.artists?.[0]?.name?.trim() ?? '';
        if (!name || !artist) return '';
        return `${name}\0${artist}`;
      },
      (key) => {
        if (remote.isRemoteMode.value) return;
        if (!key) {
          lyricsState.clearLyrics();
          return;
        }
        const [name, artist] = key.split('\0');
        void lyricsState.fetchLyrics(name ?? '', artist ?? '');
      },
      { immediate: true },
    );
    watch(
      () => [
        devices.selectedDeviceId.value,
        devices.volume.value,
        devices.devices.value.map((device) => `${device.id}:${device.name}`).join('|'),
      ],
      () => schedulePush(),
    );
    watch(server.isRunning, (running) => {
      if (!running) return;
      queueDirty = true;
      enqueuePush();
    }, { immediate: true });
  });

  listen<RemoteCommand>(REMOTE_COMMAND_EVENT, (event) => {
    const run = () => withTimeout(
      Promise.resolve(execute(event.payload)),
      COMMAND_TIMEOUT_MS,
      `remote command ${event.payload?.action ?? 'unknown'}`,
    ).catch((err) => console.error('Remote command error:', err));
    if (event.payload?.action === 'set_volume') {
      void run();
      return;
    }
    pendingCommand = pendingCommand.then(run, run);
  }).catch((err) => console.error('Remote command listener error:', err));

  setInterval(enqueuePush, PUSH_MAX_WAIT_MS);
}
