import type { NormalizedTrack } from '~/providers/types';
import { describe, expect, it } from 'vitest';
import { tidalTrackInfoToQueueTrack, toQueueTrack, ytmSearchTrackToQueueTrack } from './queueTracks';

function normalizedTrack(overrides: Partial<NormalizedTrack> = {}): NormalizedTrack {
  return {
    id: '123',
    providerId: 'tidal',
    title: 'Song',
    artists: [{ id: '1', name: 'Artist A' }, { id: '2', name: 'Artist B' }],
    duration: 200.4,
    ...overrides,
  };
}

describe('queueTracks utils', () => {
  describe('toQueueTrack', () => {
    it('should map a normalized track with its album', () => {
      expect(toQueueTrack(normalizedTrack(), { title: 'Album' })).toEqual({
        uri: 'tidal:track:123',
        name: 'Song',
        artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
        album: { name: 'Album' },
        length: 200400,
      });
    });
    it('should fall back to album artists when track artists have no names', () => {
      const track = normalizedTrack({ artists: [{ id: '1', name: '' }] });
      expect(toQueueTrack(track, { title: 'Album', artists: [{ name: 'Placebo' }] }).artists).toEqual([{ name: 'Placebo' }]);
    });
    it('should omit album and length when unknown', () => {
      const track = toQueueTrack(normalizedTrack({ duration: undefined }), null);
      expect(track.album).toBeUndefined();
      expect(track.length).toBeUndefined();
    });
  });

  describe('tidalTrackInfoToQueueTrack', () => {
    it('should resolve artist names from included resources and the album title', () => {
      const info = {
        track: {
          data: {
            id: '55',
            attributes: { title: 'Track', duration: 'PT3M5S' },
            relationships: { artists: { data: [{ id: '9', type: 'artists' }] } },
          },
          included: [{ id: '9', type: 'artists', attributes: { name: 'Included Artist' } }],
        },
        album: { data: { id: '7', attributes: { title: 'Some Album' } } },
      };
      expect(tidalTrackInfoToQueueTrack(info)).toEqual({
        uri: 'tidal:track:55',
        name: 'Track',
        artists: [{ name: 'Included Artist' }],
        album: { name: 'Some Album' },
        length: 185000,
      });
    });
    it('should return null without track data', () => {
      expect(tidalTrackInfoToQueueTrack(null)).toBeNull();
      expect(tidalTrackInfoToQueueTrack({ track: null })).toBeNull();
    });
  });

  describe('ytmSearchTrackToQueueTrack', () => {
    it('should map a ytm search track to a queue track', () => {
      expect(ytmSearchTrackToQueueTrack({
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        artists: [{ id: 'a1', name: 'Rick Astley' }],
        album: { id: 'al1', name: 'Whenever You Need Somebody' },
        durationSec: 213.4,
        thumbnailUrl: 'https://img/yt.jpg',
      })).toEqual({
        uri: 'ytm:track:dQw4w9WgXcQ',
        name: 'Never Gonna Give You Up',
        artists: [{ name: 'Rick Astley' }],
        album: { name: 'Whenever You Need Somebody' },
        length: 213400,
        coverUrl: 'https://img/yt.jpg',
      });
    });
    it('should fall back to Unknown artist and omit optional fields', () => {
      expect(ytmSearchTrackToQueueTrack({
        videoId: 'abcdefghijk',
        title: 'Solo',
        artists: [],
      })).toEqual({
        uri: 'ytm:track:abcdefghijk',
        name: 'Solo',
        artists: [{ name: 'Unknown' }],
        album: undefined,
        length: undefined,
        coverUrl: undefined,
      });
    });
    it('should return null for invalid video ids', () => {
      expect(ytmSearchTrackToQueueTrack({
        videoId: 'short',
        title: 'Bad',
        artists: [{ name: 'X' }],
      })).toBeNull();
    });
  });
});
