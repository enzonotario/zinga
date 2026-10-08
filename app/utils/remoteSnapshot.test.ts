import type { QueueItem } from './playQueue';
import { describe, expect, it } from 'vitest';
import { buildPlaybackSnapshot, buildQueueSnapshot, parsePlaybackSnapshot, parseQueueSnapshot } from './remoteSnapshot';

function item(tlid: number): QueueItem {
  return { tlid, track: { uri: `tidal:track:${tlid}`, name: `Track ${tlid}`, artists: [{ name: 'Artist' }], length: 1000 } };
}

describe('remoteSnapshot utils', () => {
  describe('buildPlaybackSnapshot', () => {
    it('should produce the Mopidy-compatible playback shape in milliseconds', () => {
      expect(buildPlaybackSnapshot('playing', 12.3456, item(2))).toEqual({
        state: 'playing',
        position: 12346,
        track: item(2),
      });
    });
    it('should strip extra fields and clamp negative positions', () => {
      const extended = { ...item(1), extra: true } as QueueItem;
      expect(buildPlaybackSnapshot('stopped', -1, extended)).toEqual({ state: 'stopped', position: 0, track: item(1) });
      expect(buildPlaybackSnapshot('paused', 0, null).track).toBeNull();
    });
  });

  describe('buildQueueSnapshot', () => {
    it('should map items to tl_track objects', () => {
      expect(buildQueueSnapshot([item(1), item(2)])).toEqual([item(1), item(2)]);
    });
  });

  describe('parsePlaybackSnapshot', () => {
    it('should convert a snapshot back to seconds and a queue item', () => {
      expect(parsePlaybackSnapshot({ state: 'paused', position: 1500, track: item(3) })).toEqual({
        state: 'paused',
        positionSec: 1.5,
        item: item(3),
      });
    });
    it('should fall back to a stopped state for invalid data', () => {
      expect(parsePlaybackSnapshot(null)).toEqual({ state: 'stopped', positionSec: 0, item: null });
      expect(parsePlaybackSnapshot({ state: 'weird', position: 'x', track: { tlid: 1 } })).toEqual({ state: 'stopped', positionSec: 0, item: null });
    });
  });

  describe('parseQueueSnapshot', () => {
    it('should accept queue_updated data and plain arrays', () => {
      expect(parseQueueSnapshot({ tracks: [item(1), { tlid: 'bad' }] })).toEqual([item(1)]);
      expect(parseQueueSnapshot([item(2)])).toEqual([item(2)]);
      expect(parseQueueSnapshot(null)).toEqual([]);
    });
  });
});
