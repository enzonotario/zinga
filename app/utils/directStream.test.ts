import { describe, expect, it } from 'vitest';
import { buildStreamUrl, canPlayDirect, getStreamSource, parseStreamUri } from './directStream';

describe('directStream utils', () => {
  describe('getStreamSource', () => {
    it('should extract the id from short TIDAL uris', () => {
      expect(getStreamSource('tidal:track:123')).toEqual({ kind: 'tidal', id: '123' });
    });
    it('should extract the id from long TIDAL uris', () => {
      expect(getStreamSource('tidal:track:1:2:123')).toEqual({ kind: 'tidal', id: '123' });
    });
    it('should return null for non-digit TIDAL ids', () => {
      expect(getStreamSource('tidal:track:abc')).toBeNull();
    });
    it('should return the path of raw file uris', () => {
      expect(getStreamSource('file:///music/a.flac')).toEqual({ kind: 'file', path: '/music/a.flac' });
    });
    it('should decode percent-encoded file uris', () => {
      expect(getStreamSource('file:///music/My%20Album/01%20Caf%C3%A9.flac'))
        .toEqual({ kind: 'file', path: '/music/My Album/01 Café.flac' });
    });
    it('should keep raw paths that are not valid percent-encoding', () => {
      expect(getStreamSource('file:///music/100% Hits.mp3')).toEqual({ kind: 'file', path: '/music/100% Hits.mp3' });
    });
    it('should return null for relative file uris', () => {
      expect(getStreamSource('file://music/a.flac')).toBeNull();
    });
    it('should return null for other uris', () => {
      expect(getStreamSource('spotify:track:1')).toBeNull();
      expect(getStreamSource('')).toBeNull();
      expect(getStreamSource(undefined)).toBeNull();
    });
  });

  describe('canPlayDirect', () => {
    it('should return false for an empty list', () => {
      expect(canPlayDirect([])).toBe(false);
    });
    it('should return true when every item has a stream source', () => {
      expect(canPlayDirect([
        { track: { uri: 'tidal:track:1' } },
        { track: { uri: 'tidal:track:1:2:3' } },
        { track: { uri: 'file:///x.flac' } },
      ])).toBe(true);
    });
    it('should return false when an item has no stream source', () => {
      expect(canPlayDirect([
        { track: { uri: 'tidal:track:1' } },
        { track: { uri: 'spotify:track:1' } },
      ])).toBe(false);
    });
    it('should return false for items without a uri', () => {
      expect(canPlayDirect([{ track: {} }, {}])).toBe(false);
    });
  });

  describe('parseStreamUri', () => {
    it('should parse a TIDAL flac stream url', () => {
      expect(parseStreamUri('http://192.168.100.2:9633/stream/42/55163275.flac?start=12.500'))
        .toEqual({ tlid: 42, startSec: 12.5 });
    });
    it('should parse a TIDAL mp3 stream url', () => {
      expect(parseStreamUri('http://192.168.100.2:9633/stream/42/55163275.mp3?start=0.000'))
        .toEqual({ tlid: 42, startSec: 0 });
    });
    it('should parse a file stream url', () => {
      expect(parseStreamUri('http://192.168.100.2:9633/file/3/0a1b2c3d4e5f60718293a4b5c6d7e8f9.mp3?start=7.250'))
        .toEqual({ tlid: 3, startSec: 7.25 });
    });
    it('should return null for unsupported extensions', () => {
      expect(parseStreamUri('http://h:9633/stream/1/2.wav?start=0.000')).toBeNull();
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
    it('should build a TIDAL flac url that round-trips', () => {
      const url = buildStreamUrl('http://10.0.0.5:9633', 7, { kind: 'tidal', id: '55163275' }, 83.25, 'flac');
      expect(url).toBe('http://10.0.0.5:9633/stream/7/55163275.flac?start=83.250');
      expect(parseStreamUri(url)).toEqual({ tlid: 7, startSec: 83.25 });
    });
    it('should build a TIDAL mp3 url that round-trips', () => {
      const url = buildStreamUrl('http://10.0.0.5:9633', 7, { kind: 'tidal', id: '55163275' }, 0, 'mp3');
      expect(url).toBe('http://10.0.0.5:9633/stream/7/55163275.mp3?start=0.000');
      expect(parseStreamUri(url)).toEqual({ tlid: 7, startSec: 0 });
    });
    it('should build file urls that round-trip', () => {
      const token = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
      const flac = buildStreamUrl('http://10.0.0.5:9633', 12, { kind: 'file', token }, 30, 'flac');
      const mp3 = buildStreamUrl('http://10.0.0.5:9633', 12, { kind: 'file', token }, 30, 'mp3');
      expect(flac).toBe(`http://10.0.0.5:9633/file/12/${token}.flac?start=30.000`);
      expect(mp3).toBe(`http://10.0.0.5:9633/file/12/${token}.mp3?start=30.000`);
      expect(parseStreamUri(flac)).toEqual({ tlid: 12, startSec: 30 });
      expect(parseStreamUri(mp3)).toEqual({ tlid: 12, startSec: 30 });
    });
  });
});
