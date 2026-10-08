import type { NormalizedTrack } from '~/providers/types';
import { describe, expect, it } from 'vitest';
import { tidalTrackInfoToQueueTrack, toQueueTrack } from './queueTracks';

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
});
