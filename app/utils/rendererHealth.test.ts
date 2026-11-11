import type { QueueItem } from './playQueue';
import type { SelfHealProbe } from './rendererHealth';
import { describe, expect, it } from 'vitest';
import { canProbeSelfHeal, isInUserStopCooldown, isStopConfirmed, selfHealTarget, STOPPED_CONFIRM_MS, USER_STOP_COOLDOWN_MS } from './rendererHealth';

const BASE = 'http://192.168.1.10:9633';
const SESSION = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

function item(tlid: number, uri: string, length = 200000): QueueItem {
  return { tlid, track: { uri, name: `Track ${tlid}`, artists: [{ name: 'Artist' }], length } };
}

const items = [item(7, 'tidal:track:111'), item(8, 'tidal:track:222')];

function probe(overrides: Partial<SelfHealProbe> = {}): SelfHealProbe {
  return {
    isRemoteMode: false,
    engineActive: false,
    hasPending: false,
    isPaused: false,
    userStoppedAt: null,
    now: 100000,
    rendererState: 'PLAYING',
    trackUri: `${BASE}/gapless/${SESSION}.flac`,
    positionSec: 250,
    baseUrl: BASE,
    items,
    gapless: {
      id: SESSION,
      tracks: [
        { tlid: 7, durationMs: 200000, startMs: 0 },
        { tlid: 8, durationMs: 100000, startMs: 0 },
      ],
    },
    ...overrides,
  };
}

describe('isStopConfirmed', () => {
  it('should not confirm without a stopped reading', () => {
    expect(isStopConfirmed(null, 10000)).toBe(false);
  });

  it('should confirm only after the stopped state lasted the full window', () => {
    expect(isStopConfirmed(1000, 1000)).toBe(false);
    expect(isStopConfirmed(1000, 1000 + STOPPED_CONFIRM_MS - 1)).toBe(false);
    expect(isStopConfirmed(1000, 1000 + STOPPED_CONFIRM_MS)).toBe(true);
  });

  it('should accept a custom window', () => {
    expect(isStopConfirmed(0, 499, 500)).toBe(false);
    expect(isStopConfirmed(0, 500, 500)).toBe(true);
  });
});

describe('isInUserStopCooldown', () => {
  it('should be inactive when the user never stopped', () => {
    expect(isInUserStopCooldown(null, 5000)).toBe(false);
  });

  it('should last for the cooldown after a user stop', () => {
    expect(isInUserStopCooldown(1000, 1000 + USER_STOP_COOLDOWN_MS - 1)).toBe(true);
    expect(isInUserStopCooldown(1000, 1000 + USER_STOP_COOLDOWN_MS)).toBe(false);
  });
});

describe('canProbeSelfHeal', () => {
  it('should probe an idle host engine', () => {
    expect(canProbeSelfHeal(probe())).toBe(true);
  });

  it.each([
    ['remote client mode', { isRemoteMode: true }],
    ['an active session', { engineActive: true }],
    ['a pending start', { hasPending: true }],
    ['a user pause', { isPaused: true }],
    ['a recent user stop', { userStoppedAt: 90000 }],
  ])('should skip with %s', (_label, overrides) => {
    expect(canProbeSelfHeal(probe(overrides))).toBe(false);
  });

  it('should probe again once the user stop cooldown expired', () => {
    expect(canProbeSelfHeal(probe({ userStoppedAt: 100000 - USER_STOP_COOLDOWN_MS }))).toBe(true);
  });
});

describe('selfHealTarget', () => {
  it('should re-attach to an own gapless stream that maps to the queue', () => {
    expect(selfHealTarget(probe())).toEqual({
      tlid: 8,
      startOffsetSec: 0,
      trackPositionSec: 50,
      gapless: { id: SESSION, tracks: [{ tlid: 7, durationSec: 200 }, { tlid: 8, durationSec: 100 }] },
    });
  });

  it('should re-attach to an own single-track stream', () => {
    const target = selfHealTarget(probe({ trackUri: `${BASE}/stream/7/111.flac?start=10.000`, positionSec: 5, gapless: null }));
    expect(target).toMatchObject({ tlid: 7, startOffsetSec: 10, trackPositionSec: 15, gapless: null });
  });

  it.each(['STOPPED', 'PAUSED_PLAYBACK', 'TRANSITIONING', 'NO_MEDIA_PRESENT'])('should not attach while the renderer is %s', (rendererState) => {
    expect(selfHealTarget(probe({ rendererState }))).toBeNull();
  });

  it('should not attach to a stream from another host', () => {
    expect(selfHealTarget(probe({ trackUri: `http://192.168.1.99:9633/gapless/${SESSION}.flac` }))).toBeNull();
  });

  it('should not attach to a foreign source', () => {
    expect(selfHealTarget(probe({ trackUri: 'http://radio.example/live.mp3', gapless: null }))).toBeNull();
  });

  it('should not attach when the stream does not map to the queue', () => {
    expect(selfHealTarget(probe({ items: [item(1, 'tidal:track:999')] }))).toBeNull();
    expect(selfHealTarget(probe({ gapless: null }))).toBeNull();
  });

  it('should not attach when the gate is closed', () => {
    expect(selfHealTarget(probe({ isRemoteMode: true }))).toBeNull();
    expect(selfHealTarget(probe({ engineActive: true }))).toBeNull();
    expect(selfHealTarget(probe({ userStoppedAt: 99000 }))).toBeNull();
  });
});
