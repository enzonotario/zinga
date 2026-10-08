import type { QueueState, QueueTrack } from '~/utils/playQueue';
import { computed, shallowRef, watch } from 'vue';
import { addTracks, clearItems, createQueueState, parseQueueState, removeItem, replaceTracks, setCurrentItem } from '~/utils/playQueue';

export type { QueueItem, QueueTrack } from '~/utils/playQueue';

const STORAGE_KEY = 'playQueue';

const state = shallowRef<QueueState>(createQueueState());
const items = computed(() => state.value.items);
const currentTlid = computed(() => state.value.currentTlid);
const currentItem = computed(() => items.value.find((item) => item.tlid === currentTlid.value));

if (import.meta.client) {
  state.value = parseQueueState(localStorage.getItem(STORAGE_KEY));
  watch(state, (next) => localStorage.setItem(STORAGE_KEY, JSON.stringify(next)));
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
  };
}
