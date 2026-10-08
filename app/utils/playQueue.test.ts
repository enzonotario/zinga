import type { QueueTrack } from './playQueue';
import { describe, expect, it } from 'vitest';
import { addTracks, clearItems, createQueueState, parseQueueState, removeItem, replaceTracks, setCurrentItem } from './playQueue';

function track(id: number): QueueTrack {
  return { uri: `tidal:track:${id}`, name: `Track ${id}`, artists: [{ name: 'Artist' }], length: 1000 };
}

describe('playQueue utils', () => {
  describe('addTracks', () => {
    it('should assign sequential tlids starting at nextTlid', () => {
      const { state, added } = addTracks(createQueueState(), [track(1), track(2)]);
      expect(added.map((item) => item.tlid)).toEqual([1, 2]);
      expect(state.items).toEqual(added);
      expect(state.nextTlid).toBe(3);
    });
    it('should select the first added item when there is no current item', () => {
      const { state } = addTracks(createQueueState(), [track(1), track(2)]);
      expect(state.currentTlid).toBe(1);
    });
    it('should keep the current item when appending', () => {
      const first = addTracks(createQueueState(), [track(1), track(2)]).state;
      const withCurrent = setCurrentItem(first, 2);
      const { state, added } = addTracks(withCurrent, [track(3)]);
      expect(added[0]!.tlid).toBe(3);
      expect(state.currentTlid).toBe(2);
      expect(state.items).toHaveLength(3);
    });
    it('should not change anything but nextTlid bookkeeping for an empty add', () => {
      const { state, added } = addTracks(createQueueState(), []);
      expect(added).toEqual([]);
      expect(state.currentTlid).toBeNull();
      expect(state.nextTlid).toBe(1);
    });
  });

  describe('replaceTracks', () => {
    it('should replace the items without reusing tlids', () => {
      const first = addTracks(createQueueState(), [track(1), track(2)]).state;
      const { state, added } = replaceTracks(first, [track(3)]);
      expect(added.map((item) => item.tlid)).toEqual([3]);
      expect(state.items).toEqual(added);
      expect(state.nextTlid).toBe(4);
    });
    it('should reset the current item to the first new item', () => {
      const first = setCurrentItem(addTracks(createQueueState(), [track(1), track(2)]).state, 2);
      expect(replaceTracks(first, [track(3), track(4)]).state.currentTlid).toBe(3);
    });
    it('should clear the current item when replacing with nothing', () => {
      const first = addTracks(createQueueState(), [track(1)]).state;
      expect(replaceTracks(first, []).state.currentTlid).toBeNull();
    });
  });

  describe('removeItem', () => {
    const base = addTracks(createQueueState(), [track(1), track(2), track(3)]).state;

    it('should remove the item and keep nextTlid', () => {
      const state = removeItem(base, 2);
      expect(state.items.map((item) => item.tlid)).toEqual([1, 3]);
      expect(state.nextTlid).toBe(4);
    });
    it('should keep the current item when removing another one', () => {
      expect(removeItem(setCurrentItem(base, 1), 3).currentTlid).toBe(1);
    });
    it('should move the current item to the next neighbor', () => {
      expect(removeItem(setCurrentItem(base, 2), 2).currentTlid).toBe(3);
    });
    it('should move the current item to the previous neighbor when removing the last item', () => {
      expect(removeItem(setCurrentItem(base, 3), 3).currentTlid).toBe(2);
    });
    it('should clear the current item when the queue becomes empty', () => {
      const single = addTracks(createQueueState(), [track(1)]).state;
      expect(removeItem(single, 1).currentTlid).toBeNull();
    });
    it('should return the same state for unknown tlids', () => {
      expect(removeItem(base, 99)).toBe(base);
    });
  });

  describe('clearItems', () => {
    it('should drop items and the current item but keep nextTlid', () => {
      const state = clearItems(addTracks(createQueueState(), [track(1), track(2)]).state);
      expect(state).toEqual({ items: [], nextTlid: 3, currentTlid: null });
    });
  });

  describe('setCurrentItem', () => {
    const base = addTracks(createQueueState(), [track(1), track(2)]).state;

    it('should select an existing item', () => {
      expect(setCurrentItem(base, 2).currentTlid).toBe(2);
    });
    it('should allow clearing the selection', () => {
      expect(setCurrentItem(base, null).currentTlid).toBeNull();
    });
    it('should ignore tlids that are not in the queue', () => {
      expect(setCurrentItem(base, 99)).toBe(base);
    });
  });

  describe('parseQueueState', () => {
    it('should return an empty state for missing or invalid data', () => {
      expect(parseQueueState(null)).toEqual(createQueueState());
      expect(parseQueueState('not json')).toEqual(createQueueState());
      expect(parseQueueState('{"items":"nope"}')).toEqual(createQueueState());
    });
    it('should restore a persisted state', () => {
      const state = setCurrentItem(addTracks(createQueueState(), [track(1), track(2)]).state, 2);
      expect(parseQueueState(JSON.stringify(state))).toEqual(state);
    });
    it('should drop malformed items and a dangling current item', () => {
      const raw = JSON.stringify({ items: [{ tlid: 5, track: track(1) }, { tlid: 'x' }], nextTlid: 2, currentTlid: 7 });
      expect(parseQueueState(raw)).toEqual({ items: [{ tlid: 5, track: track(1) }], nextTlid: 6, currentTlid: null });
    });
  });
});
