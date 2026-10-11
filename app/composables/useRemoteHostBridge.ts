import type { QueueTrack } from '~/utils/playQueue';
import type { RemotePlaybackStatus } from '~/utils/remoteSnapshot';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDebounceFn } from '@vueuse/core';
import { effectScope, ref, watch } from 'vue';
import { queueTracksFromRemote } from '~/utils/playQueue';
import { tidalTrackInfoToQueueTrack, toQueueTrack } from '~/utils/queueTracks';
import { buildDevicesSnapshot, buildPlaybackSnapshot, buildQueueSnapshot, groupRemoteCredits } from '~/utils/remoteSnapshot';
import type { RemoteCreditGroup } from '~/utils/remoteSnapshot';
import { getTidalTrackInfo } from '~/utils/tidal';
import { currentPlaybackArtwork } from './useBottomBar';
import useDevices from './useDevices';
import usePlayer from './usePlayer';
import usePlayQueue from './usePlayQueue';
import useProvider from './useProvider';
import useLyrics from './useLyrics';
import useRemoteClient from './useRemoteClient';
import useRemoteServer from './useRemoteServer';
import useTidalAuth from './useTidalAuth';

type RemoteCommand
  = | { action: 'play' | 'pause' | 'next' | 'previous' | 'queue_clear' }
    | { action: 'seek', position: number }
    | { action: 'queue_add', uris: string[] }
    | { action: 'queue_replace', tracks: unknown, startIndex?: number }
    | { action: 'queue_play_album', albumId: string }
    | { action: 'select_device', deviceId: string }
    | { action: 'set_volume', level: number };

const REMOTE_COMMAND_EVENT = 'remote-command';
const PUSH_DEBOUNCE_MS = 250;
const PUSH_MAX_WAIT_MS = 1000;

let bridgeRegistered = false;

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

  function playbackStatus(): RemotePlaybackStatus {
    if (player.isPlaying.value) return 'playing';
    if (player.isPaused.value) return 'paused';
    return 'stopped';
  }

  async function hostServerRunning() {
    try {
      const status = await invoke<{ running: boolean }>('remote_server_status');
      return status.running;
    } catch {
      return server.isRunning.value;
    }
  }

  async function push() {
    if (remote.isRemoteMode.value || !await hostServerRunning()) return;
    const includeQueue = queueDirty;
    queueDirty = false;
    try {
      await invoke('remote_broadcast_state', {
        playback: buildPlaybackSnapshot(playbackStatus(), player.position.value, player.currentItem.value, currentPlaybackArtwork(), {
          plain: lyricsState.lyrics.value,
          synced: lyricsState.syncedLyrics.value,
        }, creditGroups.value),
        queue: includeQueue ? buildQueueSnapshot(queue.items.value) : null,
        devices: buildDevicesSnapshot(devices.devices.value, devices.selectedDeviceId.value, devices.volume.value),
      });
    } catch (err) {
      queueDirty ||= includeQueue;
      console.error('Remote state push error:', err);
    }
  }

  let pushTail: Promise<void> = Promise.resolve();

  function enqueuePush() {
    pushTail = pushTail.then(() => push()).catch((err) => {
      console.error('Remote state push error:', err);
    });
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
      case 'next':
        return player.next();
      case 'previous':
        return player.previous();
      case 'seek':
        return player.seek(command.position / 1000);
      case 'queue_clear':
        return player.clear();
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
      case 'set_volume':
        return devices.setVolume(command.level);
    }
  }

  effectScope(true).run(() => {
    watch(queue.items, () => {
      queueDirty = true;
      schedulePush();
    });
    watch(
      () => {
        const artwork = currentPlaybackArtwork();
        return [playbackStatus(), player.currentItem.value?.tlid, Math.floor(player.position.value), artwork.coverUrl, artwork.artistPicture, lyricsState.lyrics.value, lyricsState.syncedLyrics.value, creditGroups.value];
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
        const track = player.currentItem.value?.track;
        return [track?.name ?? '', track?.artists?.[0]?.name ?? ''] as const;
      },
      ([name, artist]) => {
        if (!name || !artist) {
          lyricsState.clearLyrics();
          return;
        }
        void lyricsState.fetchLyrics(name, artist);
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
    const run = () => execute(event.payload).catch((err) => console.error('Remote command error:', err));
    if (event.payload?.action === 'set_volume') {
      void run();
      return;
    }
    pendingCommand = pendingCommand.then(run);
  }).catch((err) => console.error('Remote command listener error:', err));

  setInterval(enqueuePush, PUSH_MAX_WAIT_MS);
}
