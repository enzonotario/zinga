export const WS_STALE_TIMEOUT_MS = 15000;
export const WS_WATCHDOG_INTERVAL_MS = 5000;

export function isSocketStale(lastActivityAt: number | null, now: number, timeoutMs = WS_STALE_TIMEOUT_MS) {
  return lastActivityAt != null && now - lastActivityAt >= timeoutMs;
}
