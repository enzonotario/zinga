import type { QueueItem } from './playQueue';
import { describe, expect, it } from 'vitest';
import { buildDevicesSnapshot, buildPlaybackNavigation, buildPlaybackSnapshot, buildQueueSnapshot, parseDevicesSnapshot, parsePlaybackSnapshot, parseQueueSnapshot, remoteLyricsView, remoteNavigationRoutes } from './remoteSnapshot';

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
        provider: null,
        albumId: null,
        artistIds: [],
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
        provider: null,
        albumId: null,
        artistIds: [],
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
        pauseAtEnd: false,
        navigation: { provider: null, albumId: null, artistIds: [] },
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
      const fallback = { state: 'stopped', positionSec: 0, item: null, coverUrl: null, artistPicture: null, coverPath: null, lyrics: null, credits: null, pauseAtEnd: false, navigation: { provider: null, albumId: null, artistIds: [] } };
      expect(parsePlaybackSnapshot(null)).toEqual(fallback);
      expect(parsePlaybackSnapshot({ state: 'weird', position: 'x', track: { tlid: 1 } })).toEqual(fallback);
    });
    it('should read the pause-at-end flag', () => {
      expect(parsePlaybackSnapshot({ state: 'playing', pauseAtEnd: true }).pauseAtEnd).toBe(true);
      expect(parsePlaybackSnapshot({ state: 'playing', pauseAtEnd: 'yes' }).pauseAtEnd).toBe(false);
    });
    it('should read the navigation fields and drop invalid ids', () => {
      expect(parsePlaybackSnapshot({ provider: 'tidal', albumId: '42', artistIds: ['7', 7, '7', '../x', null] }).navigation).toEqual({
        provider: 'tidal',
        albumId: '42',
        artistIds: ['7'],
      });
      expect(parsePlaybackSnapshot({ provider: 'spotify', albumId: '42', artistIds: ['7'] }).navigation).toEqual({
        provider: null,
        albumId: null,
        artistIds: [],
      });
    });
    it('should round-trip the navigation built by the host', () => {
      const navigation = { provider: 'ytm' as const, albumId: 'MPREb_abc', artistIds: [] };
      expect(parsePlaybackSnapshot(buildPlaybackSnapshot('playing', 1, item(1), undefined, null, null, true, true, navigation))).toMatchObject({
        pauseAtEnd: true,
        navigation,
      });
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

  describe('buildPlaybackNavigation', () => {
    const tidalTrack = { uri: 'tidal:track:300', name: 'Song', artists: [{ name: 'A' }] };

    it('should use the loaded TIDAL metadata of the same track', () => {
      const tidalData = {
        uri: 'tidal:track:300',
        album: { data: { id: '200' } },
        artist: { data: { id: '100' } },
        track: { relationships: { artists: { data: [{ id: '100' }, { id: '101' }] } } },
      };
      expect(buildPlaybackNavigation(tidalTrack, tidalData)).toEqual({ provider: 'tidal', albumId: '200', artistIds: ['100', '101'] });
    });

    it('should fall back to track relationships when album and artist are missing', () => {
      const tidalData = {
        uri: 'tidal:track:300',
        track: { relationships: { albums: { data: [{ id: '201' }] }, artists: { data: [{ id: '102' }] } } },
      };
      expect(buildPlaybackNavigation(tidalTrack, tidalData)).toEqual({ provider: 'tidal', albumId: '201', artistIds: ['102'] });
    });

    it('should ignore metadata that belongs to another track', () => {
      const tidalData = { uri: 'tidal:track:999', album: { data: { id: '200' } }, artist: { data: { id: '100' } } };
      expect(buildPlaybackNavigation(tidalTrack, tidalData)).toEqual({ provider: 'tidal', albumId: null, artistIds: [] });
    });

    it('should read ids embedded in a long TIDAL uri', () => {
      expect(buildPlaybackNavigation({ ...tidalTrack, uri: 'tidal:track:1:2:3' })).toEqual({ provider: 'tidal', albumId: '2', artistIds: ['1'] });
    });

    it('should take the YouTube Music album from the album uri', () => {
      const track = { uri: 'ytm:track:dQw4w9WgXcQ', name: 'Song', artists: [{ name: 'A' }], album: { name: 'Album', uri: 'ytm:album:MPREb_abc' } };
      expect(buildPlaybackNavigation(track)).toEqual({ provider: 'ytm', albumId: 'MPREb_abc', artistIds: [] });
      expect(buildPlaybackNavigation({ ...track, album: { name: 'Album' } })).toEqual({ provider: 'ytm', albumId: null, artistIds: [] });
    });

    it('should leave local files and missing tracks without navigation', () => {
      expect(buildPlaybackNavigation({ uri: 'file:///music/a.flac', name: 'A', artists: [] })).toEqual({ provider: null, albumId: null, artistIds: [] });
      expect(buildPlaybackNavigation(null)).toEqual({ provider: null, albumId: null, artistIds: [] });
    });
  });

  describe('remoteNavigationRoutes', () => {
    it('should map TIDAL ids to the TIDAL pages', () => {
      expect(remoteNavigationRoutes({ provider: 'tidal', albumId: '200', artistIds: ['100', '101'] })).toEqual({
        albumRoute: '/album/200',
        artistRoute: '/artist/100',
      });
    });

    it('should map YouTube Music ids to the YouTube Music pages', () => {
      expect(remoteNavigationRoutes({ provider: 'ytm', albumId: 'MPREb_abc', artistIds: ['UC123'] })).toEqual({
        albumRoute: '/ytm/album/MPREb_abc',
        artistRoute: '/ytm/artist/UC123',
      });
    });

    it('should return no routes without a provider or ids', () => {
      expect(remoteNavigationRoutes({ provider: null, albumId: '1', artistIds: ['2'] })).toEqual({ albumRoute: null, artistRoute: null });
      expect(remoteNavigationRoutes({ provider: 'tidal', albumId: null, artistIds: [] })).toEqual({ albumRoute: null, artistRoute: null });
    });
  });
});
