import type { QueueItem } from './playQueue';
import { describe, expect, it } from 'vitest';
import { buildDevicesSnapshot, buildPlaybackSnapshot, buildQueueSnapshot, parseDevicesSnapshot, parsePlaybackSnapshot, parseQueueSnapshot, remoteLyricsView } from './remoteSnapshot';

function item(tlid: number): QueueItem {
  return { tlid, track: { uri: `tidal:track:${tlid}`, name: `Track ${tlid}`, artists: [{ name: 'Artist' }], length: 1000 } };
}

describe('remoteSnapshot utils', () => {
  describe('buildPlaybackSnapshot', () => {
    it('should produce the remote playback shape in milliseconds', () => {
      expect(buildPlaybackSnapshot('playing', 12.3456, item(2), { coverUrl: 'https://img/cover.jpg', artistPicture: 'https://img/artist.jpg' }, { plain: 'Hola', synced: '[00:01.00]Hola' }, [
        { role: 'Trumpet', names: ['Sheila'] },
        { role: ' Trumpet ', names: ['Sheila'] },
        { role: 'Bass', names: ['Duane'] },
      ])).toEqual({
        state: 'playing',
        position: 12346,
        track: item(2),
        coverUrl: 'https://img/cover.jpg',
        artistPicture: 'https://img/artist.jpg',
        coverPath: '/api/playback/cover',
        lyrics: { plain: 'Hola', synced: '[00:01.00]Hola' },
        credits: [{ role: 'Trumpet', names: ['Sheila'] }, { role: 'Bass', names: ['Duane'] }],
        hasQueue: false,
        pauseAtEnd: false,
      });
    });
    it('should strip extra fields and clamp negative positions', () => {
      const extended = { ...item(1), extra: true } as QueueItem;
      expect(buildPlaybackSnapshot('stopped', -1, extended)).toEqual({
        state: 'stopped',
        position: 0,
        track: item(1),
        coverUrl: null,
        artistPicture: null,
        coverPath: null,
        lyrics: null,
        credits: null,
        hasQueue: false,
        pauseAtEnd: false,
      });
      expect(buildPlaybackSnapshot('paused', 0, null, undefined, null, null, true)).toMatchObject({
        track: null,
        hasQueue: true,
      });
    });
    it('should keep a lyrics search state when there is no text yet', () => {
      expect(buildPlaybackSnapshot('playing', 1, item(4), undefined, { plain: null, synced: null, status: 'loading' }).lyrics).toEqual({
        plain: null,
        synced: null,
        status: 'loading',
      });
      expect(buildPlaybackSnapshot('playing', 1, item(4), undefined, { plain: null, synced: null, status: 'missing' }).lyrics).toEqual({
        plain: null,
        synced: null,
        status: 'missing',
      });
    });
  });

  describe('buildQueueSnapshot', () => {
    it('should map items to tl_track objects', () => {
      expect(buildQueueSnapshot([item(1), item(2)])).toEqual([item(1), item(2)]);
    });
  });

  describe('parsePlaybackSnapshot', () => {
    it('should convert a snapshot back to seconds and a queue item', () => {
      expect(parsePlaybackSnapshot({
        state: 'paused',
        position: 1500,
        track: item(3),
        coverUrl: 'https://img/cover.jpg',
        artistPicture: 'https://img/artist.jpg',
        lyrics: { plain: '  linea  ', synced: '' },
      })).toEqual({
        state: 'paused',
        positionSec: 1.5,
        item: item(3),
        coverUrl: 'https://img/cover.jpg',
        artistPicture: 'https://img/artist.jpg',
        coverPath: '/api/playback/cover',
        lyrics: { plain: 'linea', synced: null },
        credits: null,
      });
    });
    it('should keep a pending lyrics search without text', () => {
      expect(parsePlaybackSnapshot({
        state: 'playing',
        position: 1000,
        track: item(4),
        lyrics: { plain: null, synced: null, status: 'loading' },
      }).lyrics).toEqual({ plain: null, synced: null, status: 'loading' });
    });
    it('should fall back to a stopped state for invalid data', () => {
      expect(parsePlaybackSnapshot(null)).toEqual({ state: 'stopped', positionSec: 0, item: null, coverUrl: null, artistPicture: null, coverPath: null, lyrics: null, credits: null });
      expect(parsePlaybackSnapshot({ state: 'weird', position: 'x', track: { tlid: 1 } })).toEqual({ state: 'stopped', positionSec: 0, item: null, coverUrl: null, artistPicture: null, coverPath: null, lyrics: null, credits: null });
    });
  });

  describe('remoteLyricsView', () => {
    it('should stay on the unavailable message when the server has no lyrics', () => {
      expect(remoteLyricsView(null, true)).toEqual({ loading: false, missing: true, plain: null, synced: null });
      expect(remoteLyricsView({ plain: null, synced: null, status: 'missing' }, true)).toEqual({ loading: false, missing: true, plain: null, synced: null });
    });
    it('should show the skeleton only while the server is still searching', () => {
      expect(remoteLyricsView({ plain: null, synced: null, status: 'loading' }, true)).toEqual({ loading: true, missing: false, plain: null, synced: null });
    });
    it('should show the lyric text without treating it as a new search', () => {
      expect(remoteLyricsView({ plain: 'Hola', synced: null }, true)).toEqual({ loading: false, missing: false, plain: 'Hola', synced: null });
      expect(remoteLyricsView(null, false)).toEqual({ loading: false, missing: false, plain: null, synced: null });
    });
  });

  describe('parseQueueSnapshot', () => {
    it('should accept queue_updated data and plain arrays', () => {
      expect(parseQueueSnapshot({ tracks: [item(1), { tlid: 'bad' }] })).toEqual([item(1)]);
      expect(parseQueueSnapshot([item(2)])).toEqual([item(2)]);
      expect(parseQueueSnapshot(null)).toEqual([]);
    });
  });

  describe('devices snapshot', () => {
    it('should keep the host renderer list and selected output', () => {
      const snapshot = buildDevicesSnapshot(
        [{ id: 'solo', name: 'Solo Uno', modelName: 'Solo' }],
        'solo',
        16,
      );
      expect(parseDevicesSnapshot(snapshot)).toEqual(snapshot);
      expect(parseDevicesSnapshot({ devices: [{ id: 1 }], selectedDeviceId: 4, volume: null })).toEqual({
        devices: [],
        selectedDeviceId: null,
        volume: null,
      });
    });
  });
});
