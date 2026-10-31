import type { QueueState, QueueTrack } from '~/utils/playQueue';
import { invoke } from '@tauri-apps/api/core';
import { computed, shallowRef, watch } from 'vue';
import { addTracks, clearItems, createQueueState, parseQueueState, removeItem, replaceTracks, setCurrentItem, setTrackLength } from '~/utils/playQueue';
import { parsePlaybackSnapshot, parseQueueSnapshot } from '~/utils/remoteSnapshot';
import useRemoteClient from './useRemoteClient';

export type { QueueItem, QueueTrack } from '~/utils/playQueue';

const STORAGE_KEY = 'playQueue';

const state = shallowRef<QueueState>(createQueueState());
const remote = useRemoteClient();
const items = computed(() => (remote.isRemoteMode.value ? parseQueueSnapshot(remote.lastQueueUpdate.value) : state.value.items));
const currentTlid = computed(() => {
  if (!remote.isRemoteMode.value) return state.value.currentTlid;
  return parsePlaybackSnapshot(remote.lastPlaybackState.value).item?.tlid ?? null;
});
const currentItem = computed(() => items.value.find((item) => item.tlid === currentTlid.value));

const YTM_URI_PREFIX = 'ytm:track:';
const durationLookups = new Set<string>();
let durationFillRunning = false;

function setLength(uri: string, lengthMs: number) {
  state.value = setTrackLength(state.value, uri, lengthMs);
}

// Shelf durations are often missing or wrong; yt-dlp duration is authoritative once resolved
async function fillMissingYtmDurations() {
  if (durationFillRunning || remote.isRemoteMode.value) return;
  durationFillRunning = true;
  try {
    let next = state.value.items.find((item) => item.track.uri.startsWith(YTM_URI_PREFIX) && !durationLookups.has(item.track.uri));
    while (next) {
      const uri = next.track.uri;
      durationLookups.add(uri);
      try {
        const durationSec = await invoke<number | null>('ytm_prepare_stream', { videoId: uri.slice(YTM_URI_PREFIX.length) });
        if (durationSec) setLength(uri, durationSec * 1000);
      } catch (err) {
        console.error('YouTube Music duration lookup error:', err);
      }
      next = state.value.items.find((item) => item.track.uri.startsWith(YTM_URI_PREFIX) && !durationLookups.has(item.track.uri));
    }
  } finally {
    durationFillRunning = false;
  }
}

if (import.meta.client) {
  state.value = parseQueueState(localStorage.getItem(STORAGE_KEY));
  watch(state, (next) => localStorage.setItem(STORAGE_KEY, JSON.stringify(next)));
  watch(() => state.value.items.length, () => void fillMissingYtmDurations(), { immediate: true });
}

function add(tracks: QueueTrack[]) {
  const change = addTracks(state.value, tracks);
  state.value = change.state;
  return change.added;
}

function replace(tracks: QueueTrack[]) {
  const change = replaceTracks(state.value, tracks);
  state.value = change.state;
  return change.added;
}

function remove(tlid: number) {
  if (remote.isRemoteMode.value) {
    void remote.apiFetch('/api/queue/remove', {
      method: 'POST',
      body: JSON.stringify({ tlid }),
    }).catch((err) => console.error('Remote queue remove error:', err));
    return;
  }
  state.value = removeItem(state.value, tlid);
}

function clear() {
  state.value = clearItems(state.value);
}

function setCurrent(tlid: number | null) {
  state.value = setCurrentItem(state.value, tlid);
}

export default function usePlayQueue() {
  return {
    items,
    currentTlid,
    currentItem,
    add,
    replace,
    remove,
    clear,
    setCurrent,
    setLength,
  };
}
