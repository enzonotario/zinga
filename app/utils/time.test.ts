import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeHHMMSS, timeToSeconds } from './time';

describe('time utils', () => {
  describe('timeToSeconds', () => {
    it('should convert MM:SS to seconds', () => {
      expect(timeToSeconds('01:30')).toBe(90);
      expect(timeToSeconds('00:45')).toBe(45);
      expect(timeToSeconds('10:00')).toBe(600);
    });
    it('should convert HH:MM:SS to seconds', () => {
      expect(timeToSeconds('01:00:00')).toBe(3600);
      expect(timeToSeconds('00:01:01')).toBe(61);
      expect(timeToSeconds('02:30:45')).toBe(9045);
    });
    it('should return 0 for invalid formats', () => {
      expect(timeToSeconds('invalid')).toBe(0);
      expect(timeToSeconds('')).toBe(0);
    });
  });
  describe('formatTime', () => {
    it('should format seconds to MM:SS', () => {
      expect(formatTime(90)).toBe('01:30');
      expect(formatTime(45)).toBe('00:45');
      expect(formatTime(600)).toBe('10:00');
      expect(formatTime(3601)).toBe('60:01');
    });
    it('should handle 0 seconds', () => {
      expect(formatTime(0)).toBe('00:00');
    });
  });
  describe('formatTimeHHMMSS', () => {
    it('should format seconds to HH:MM:SS', () => {
      expect(formatTimeHHMMSS(3600)).toBe('01:00:00');
      expect(formatTimeHHMMSS(9045)).toBe('02:30:45');
      expect(formatTimeHHMMSS(61)).toBe('00:01:01');
    });
    it('should handle 0 seconds', () => {
      expect(formatTimeHHMMSS(0)).toBe('00:00:00');
    });
  });
});
