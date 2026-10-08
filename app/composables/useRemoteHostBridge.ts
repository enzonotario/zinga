import type { QueueTrack } from '~/utils/playQueue';
import type { RemotePlaybackStatus } from '~/utils/remoteSnapshot';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDebounceFn } from '@vueuse/core';
import { effectScope, watch } from 'vue';
import { tidalTrackInfoToQueueTrack, toQueueTrack } from '~/utils/queueTracks';
import { buildPlaybackSnapshot, buildQueueSnapshot } from '~/utils/remoteSnapshot';
import { getTidalTrackInfo } from '~/utils/tidal';
import usePlayer from './usePlayer';
import usePlayQueue from './usePlayQueue';
import useProvider from './useProvider';
import useRemoteClient from './useRemoteClient';
import useRemoteServer from './useRemoteServer';
import useTidalAuth from './useTidalAuth';

type RemoteCommand
  = | { action: 'play' | 'pause' | 'next' | 'previous' | 'queue_clear' }
    | { action: 'seek', position: number }
    | { action: 'queue_add', uris: string[] }
    | { action: 'queue_play_album', albumId: string };

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
  let queueDirty = true;
  let pendingCommand = Promise.resolve();

  function playbackStatus(): RemotePlaybackStatus {
    if (player.isPlaying.value) return 'playing';
    if (player.isPaused.value) return 'paused';
    return 'stopped';
  }

  async function push() {
    if (!server.isRunning.value || remote.isRemoteMode.value) return;
    const includeQueue = queueDirty;
    queueDirty = false;
    try {
      await invoke('remote_broadcast_state', {
        playback: buildPlaybackSnapshot(playbackStatus(), player.position.value, player.currentItem.value),
        queue: includeQueue ? buildQueueSnapshot(queue.items.value) : null,
      });
    } catch (err) {
      queueDirty ||= includeQueue;
      console.error('Remote state push error:', err);
    }
  }

  const schedulePush = useDebounceFn(push, PUSH_DEBOUNCE_MS, { maxWait: PUSH_MAX_WAIT_MS });

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
      case 'queue_play_album':
        return player.playTracks(await loadAlbumTracks(command.albumId));
    }
  }

  effectScope(true).run(() => {
    watch(queue.items, () => {
      queueDirty = true;
      schedulePush();
    });
    watch(
      () => [playbackStatus(), player.currentItem.value?.tlid, Math.floor(player.position.value)],
      () => schedulePush(),
    );
    watch(server.isRunning, (running) => {
      if (!running) return;
      queueDirty = true;
      push();
    }, { immediate: true });
  });

  listen<RemoteCommand>(REMOTE_COMMAND_EVENT, (event) => {
    pendingCommand = pendingCommand
      .then(() => execute(event.payload))
      .catch((err) => console.error('Remote command error:', err));
  }).catch((err) => console.error('Remote command listener error:', err));
}
