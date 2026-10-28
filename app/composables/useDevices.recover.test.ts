import { describe, expect, it } from 'vitest';
import { isSelectedDeviceGoneError } from './useDevices';

describe('isSelectedDeviceGoneError', () => {
  it('matches device missing and transport failures', () => {
    expect(isSelectedDeviceGoneError('device not found')).toBe(true);
    expect(isSelectedDeviceGoneError('request error: Connection refused')).toBe(true);
    expect(isSelectedDeviceGoneError('timed out')).toBe(true);
    expect(isSelectedDeviceGoneError('volume must be 0-100')).toBe(false);
  });
});
