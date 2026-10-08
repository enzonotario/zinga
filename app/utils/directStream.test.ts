import { describe, expect, it } from 'vitest';
import { buildStreamUrl, canPlayDirect, getTidalTrackId, parseStreamUri } from './directStream';

describe('directStream utils', () => {
  describe('getTidalTrackId', () => {
    it('should extract the id from short TIDAL uris', () => {
      expect(getTidalTrackId('tidal:track:123')).toBe('123');
    });
    it('should extract the id from long TIDAL uris', () => {
      expect(getTidalTrackId('tidal:track:1:2:123')).toBe('123');
    });
    it('should return null for non-TIDAL uris', () => {
      expect(getTidalTrackId('file:///x.flac')).toBeNull();
    });
    it('should return null for non-digit ids', () => {
      expect(getTidalTrackId('tidal:track:abc')).toBeNull();
    });
    it('should return null for undefined', () => {
      expect(getTidalTrackId(undefined)).toBeNull();
    });
  });

  describe('canPlayDirect', () => {
    it('should return false for an empty list', () => {
      expect(canPlayDirect([])).toBe(false);
    });
    it('should return true when every item is a TIDAL track', () => {
      expect(canPlayDirect([
        { track: { uri: 'tidal:track:1' } },
        { track: { uri: 'tidal:track:1:2:3' } },
      ])).toBe(true);
    });
    it('should return false for a mixed list', () => {
      expect(canPlayDirect([
        { track: { uri: 'tidal:track:1' } },
        { track: { uri: 'file:///x.flac' } },
      ])).toBe(false);
    });
  });

  describe('parseStreamUri', () => {
    it('should parse a direct stream url', () => {
      expect(parseStreamUri('http://192.168.100.2:9633/stream/42/55163275.flac?start=12.500'))
        .toEqual({ tlid: 42, startSec: 12.5 });
    });
    it('should return null for the Icecast url', () => {
      expect(parseStreamUri('http://h:8000/mopidy')).toBeNull();
    });
    it('should return null for null or undefined', () => {
      expect(parseStreamUri(null)).toBeNull();
      expect(parseStreamUri(undefined)).toBeNull();
    });
  });

  describe('buildStreamUrl', () => {
    it('should round-trip through parseStreamUri', () => {
      const url = buildStreamUrl('http://10.0.0.5:9633', 7, '55163275', 83.25);
      expect(url).toBe('http://10.0.0.5:9633/stream/7/55163275.flac?start=83.250');
      expect(parseStreamUri(url)).toEqual({ tlid: 7, startSec: 83.25 });
    });
  });
});
