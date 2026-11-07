import type { QueueItem } from './playQueue';
import { describe, expect, it } from 'vitest';
import { gaplessSessionId, resolveAttachTarget } from './rendererAttach';

const BASE = 'http://192.168.1.10:9633';
const SESSION = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

function item(tlid: number, uri: string, length = 200000): QueueItem {
  return { tlid, track: { uri, name: `Track ${tlid}`, artists: [{ name: 'Artist' }], length } };
}

const items = [
  item(7, 'tidal:track:111'),
  item(8, 'tidal:track:222'),
  item(9, 'ytm:track:dQw4w9WgXcQ'),
  item(10, 'file:///music/a.flac'),
];

function gapless(startMs = 0) {
  return {
    id: SESSION,
    tracks: [
      { tlid: 7, durationMs: 200000, startMs },
      { tlid: 8, durationMs: 100000, startMs: 0 },
    ],
  };
}

describe('gaplessSessionId', () => {
  it('should extract the session id from a gapless url', () => {
    expect(gaplessSessionId(`${BASE}/gapless/${SESSION}.flac`)).toBe(SESSION);
    expect(gaplessSessionId(`${BASE}/gapless/${SESSION}.mp3`)).toBe(SESSION);
  });
  it('should return null for direct stream urls', () => {
    expect(gaplessSessionId(`${BASE}/stream/7/111.flac?start=0.000`)).toBeNull();
    expect(gaplessSessionId('')).toBeNull();
  });
});

describe('resolveAttachTarget', () => {
  it('should map a TIDAL stream url to its queue item and offsets', () => {
    expect(resolveAttachTarget({
      trackUri: `${BASE}/stream/8/222.flac?start=30.000`,
      streamPositionSec: 12,
      baseUrl: BASE,
      items,
    })).toEqual({ tlid: 8, startOffsetSec: 30, trackPositionSec: 42, gapless: null });
  });

  it('should map ytm and file stream urls', () => {
    expect(resolveAttachTarget({
      trackUri: `${BASE}/ytm/9/dQw4w9WgXcQ.mp3?start=0.000`,
      streamPositionSec: 5,
      baseUrl: BASE,
      items,
    })?.tlid).toBe(9);
    expect(resolveAttachTarget({
      trackUri: `${BASE}/file/10/0a1b2c3d4e5f60718293a4b5c6d7e8f9.flac?start=0.000`,
      streamPositionSec: 5,
      baseUrl: BASE,
      items,
    })?.tlid).toBe(10);
  });

  it('should ignore streams served by another Zinga instance', () => {
    expect(resolveAttachTarget({
      trackUri: 'http://192.168.1.54:9633/stream/8/222.flac?start=0.000',
      streamPositionSec: 12,
      baseUrl: BASE,
      items,
    })).toBeNull();
    expect(resolveAttachTarget({
      trackUri: `${BASE}:1/stream/8/222.flac?start=0.000`,
      streamPositionSec: 12,
      baseUrl: BASE,
      items,
    })).toBeNull();
  });

  it('should ignore tlids missing from the queue', () => {
    expect(resolveAttachTarget({
      trackUri: `${BASE}/stream/99/222.flac?start=0.000`,
      streamPositionSec: 1,
      baseUrl: BASE,
      items,
    })).toBeNull();
  });

  it('should ignore a tlid whose queue item is a different track', () => {
    expect(resolveAttachTarget({
      trackUri: `${BASE}/stream/8/333.flac?start=0.000`,
      streamPositionSec: 1,
      baseUrl: BASE,
      items,
    })).toBeNull();
    expect(resolveAttachTarget({
      trackUri: `${BASE}/stream/10/444.flac?start=0.000`,
      streamPositionSec: 1,
      baseUrl: BASE,
      items,
    })).toBeNull();
  });

  it('should ignore unrelated uris', () => {
    expect(resolveAttachTarget({ trackUri: '', streamPositionSec: 0, baseUrl: BASE, items })).toBeNull();
    expect(resolveAttachTarget({ trackUri: `${BASE}/other`, streamPositionSec: 0, baseUrl: BASE, items })).toBeNull();
    expect(resolveAttachTarget({ trackUri: `${BASE}/stream/8/222.flac?start=0.000`, streamPositionSec: 0, baseUrl: '', items })).toBeNull();
  });

  it('should locate the current track inside a gapless session', () => {
    expect(resolveAttachTarget({
      trackUri: `${BASE}/gapless/${SESSION}.flac`,
      streamPositionSec: 210,
      baseUrl: BASE,
      items,
      gapless: gapless(),
    })).toEqual({
      tlid: 8,
      startOffsetSec: 0,
      trackPositionSec: 10,
      gapless: { id: SESSION, tracks: [{ tlid: 7, durationSec: 200 }, { tlid: 8, durationSec: 100 }] },
    });
  });

  it('should account for a gapless session that started mid-track', () => {
    const early = resolveAttachTarget({
      trackUri: `${BASE}/gapless/${SESSION}.flac`,
      streamPositionSec: 30,
      baseUrl: BASE,
      items,
      gapless: gapless(150000),
    });
    expect(early).toMatchObject({ tlid: 7, startOffsetSec: 150, trackPositionSec: 180 });
    const crossed = resolveAttachTarget({
      trackUri: `${BASE}/gapless/${SESSION}.flac`,
      streamPositionSec: 60,
      baseUrl: BASE,
      items,
      gapless: gapless(150000),
    });
    expect(crossed).toMatchObject({ tlid: 8, startOffsetSec: 150, trackPositionSec: 10 });
  });

  it('should ignore a gapless url without matching session info', () => {
    const input = { trackUri: `${BASE}/gapless/${SESSION}.flac`, streamPositionSec: 10, baseUrl: BASE, items };
    expect(resolveAttachTarget(input)).toBeNull();
    expect(resolveAttachTarget({ ...input, gapless: { ...gapless(), id: 'abc' } })).toBeNull();
    expect(resolveAttachTarget({ ...input, gapless: { id: SESSION, tracks: [] } })).toBeNull();
  });

  it('should ignore a gapless session whose current track left the queue', () => {
    expect(resolveAttachTarget({
      trackUri: `${BASE}/gapless/${SESSION}.flac`,
      streamPositionSec: 210,
      baseUrl: BASE,
      items: items.filter((entry) => entry.tlid !== 8),
      gapless: gapless(),
    })).toBeNull();
  });
});
