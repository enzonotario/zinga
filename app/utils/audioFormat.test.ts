import { describe, expect, it } from 'vitest';
import { buildAudioFormat, parseBitrate, parseSampleRate } from './audioFormat';

describe('audioFormat utils', () => {
  describe('buildAudioFormat', () => {
    it('should format full audio info', () => {
      const params = {
        bitrate: 822.17,
        sampleRate: 44.1,
        bitsPerSample: 16,
        channels: 2,
      };
      expect(buildAudioFormat(params)).toBe('822.17 kbps, 44.1 kHz, 16 bits, 2 ch');
    });
    it('should format partial audio info', () => {
      expect(buildAudioFormat({ bitrate: 320 })).toBe('320.00 kbps');
      expect(buildAudioFormat({ sampleRate: 48, bitsPerSample: 24 })).toBe('48 kHz, 24 bits');
    });
    it('should return undefined for empty params', () => {
      expect(buildAudioFormat({})).toBeUndefined();
    });
    it('should handle null/undefined values', () => {
      expect(buildAudioFormat({ bitrate: null, sampleRate: undefined })).toBeUndefined();
    });
  });
  describe('parseBitrate', () => {
    it('should parse bitrate string to kbps', () => {
      expect(parseBitrate('320000')).toBe(320);
      expect(parseBitrate('1411200')).toBe(1411.2);
    });
    it('should return null for empty input', () => {
      expect(parseBitrate(null)).toBeNull();
      expect(parseBitrate('')).toBeNull();
    });
  });
  describe('parseSampleRate', () => {
    it('should parse sample rate string to kHz', () => {
      expect(parseSampleRate('44100')).toBe(44.1);
      expect(parseSampleRate('48000')).toBe(48);
      expect(parseSampleRate('96000')).toBe(96);
    });
    it('should return null for empty input', () => {
      expect(parseSampleRate(null)).toBeNull();
      expect(parseSampleRate(undefined)).toBeNull();
    });
  });
});
