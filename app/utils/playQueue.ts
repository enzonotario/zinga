export interface QueueTrack {
  uri: string
  name: string
  artists: { name: string }[]
  album?: { name: string, uri?: string }
  length?: number
}

export interface QueueItem {
  tlid: number
  track: QueueTrack
}

export interface QueueState {
  items: QueueItem[]
  nextTlid: number
  currentTlid: number | null
}

export interface QueueChange {
  state: QueueState
  added: QueueItem[]
}

export function createQueueState(): QueueState {
  return { items: [], nextTlid: 1, currentTlid: null };
}

function toItems(tracks: QueueTrack[], firstTlid: number): QueueItem[] {
  return tracks.map((track, index) => ({ tlid: firstTlid + index, track }));
}

export function addTracks(state: QueueState, tracks: QueueTrack[]): QueueChange {
  const added = toItems(tracks, state.nextTlid);
  const hasCurrent = state.items.some((item) => item.tlid === state.currentTlid);
  return {
    state: {
      items: [...state.items, ...added],
      nextTlid: state.nextTlid + added.length,
      currentTlid: hasCurrent ? state.currentTlid : added[0]?.tlid ?? state.currentTlid,
    },
    added,
  };
}

export function replaceTracks(state: QueueState, tracks: QueueTrack[]): QueueChange {
  const added = toItems(tracks, state.nextTlid);
  return {
    state: {
      items: added,
      nextTlid: state.nextTlid + added.length,
      currentTlid: added[0]?.tlid ?? null,
    },
    added,
  };
}

export function removeItem(state: QueueState, tlid: number): QueueState {
  const index = state.items.findIndex((item) => item.tlid === tlid);
  if (index < 0) return state;
  const items = state.items.filter((item) => item.tlid !== tlid);
  if (state.currentTlid !== tlid) return { ...state, items };
  const neighbor = items[index] ?? items[index - 1];
  return { ...state, items, currentTlid: neighbor?.tlid ?? null };
}

export function clearItems(state: QueueState): QueueState {
  return { ...state, items: [], currentTlid: null };
}

export function setCurrentItem(state: QueueState, tlid: number | null): QueueState {
  if (tlid === state.currentTlid) return state;
  if (tlid != null && !state.items.some((item) => item.tlid === tlid)) return state;
  return { ...state, currentTlid: tlid };
}

export function isQueueItem(value: any): value is QueueItem {
  return Number.isInteger(value?.tlid)
    && typeof value.track?.uri === 'string'
    && typeof value.track.name === 'string'
    && Array.isArray(value.track.artists);
}

export function parseQueueState(raw: string | null): QueueState {
  if (!raw) return createQueueState();
  try {
    const parsed = JSON.parse(raw);
    const items: QueueItem[] = Array.isArray(parsed?.items) ? parsed.items.filter(isQueueItem) : [];
    const maxTlid = items.reduce((max, item) => Math.max(max, item.tlid), 0);
    const nextTlid = Number.isInteger(parsed?.nextTlid) ? Math.max(parsed.nextTlid, maxTlid + 1) : maxTlid + 1;
    const currentTlid = items.some((item) => item.tlid === parsed?.currentTlid) ? parsed.currentTlid : null;
    return { items, nextTlid, currentTlid };
  } catch {
    return createQueueState();
  }
}
