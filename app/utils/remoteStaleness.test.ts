import { describe, expect, it } from 'vitest';
import { isSocketStale, WS_STALE_TIMEOUT_MS } from './remoteStaleness';

describe('isSocketStale', () => {
  it('should not flag a socket that was never opened', () => {
    expect(isSocketStale(null, 1_000_000)).toBe(false);
  });

  it('should stay fresh while messages keep arriving', () => {
    expect(isSocketStale(1000, 1000)).toBe(false);
    expect(isSocketStale(1000, 1000 + WS_STALE_TIMEOUT_MS - 1)).toBe(false);
  });

  it('should flag a socket silent for the full timeout', () => {
    expect(isSocketStale(1000, 1000 + WS_STALE_TIMEOUT_MS)).toBe(true);
  });

  it('should accept a custom timeout', () => {
    expect(isSocketStale(0, 999, 1000)).toBe(false);
    expect(isSocketStale(0, 1000, 1000)).toBe(true);
  });
});
