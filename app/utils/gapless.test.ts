import { describe, expect, it } from 'vitest';
import { gaplessUrl, isGaplessUrl, locateGaplessTrack } from './gapless';

const tracks = [
  { tlid: 1, durationSec: 180 },
  { tlid: 2, durationSec: 90 },
  { tlid: 3, durationSec: 240 },
];

describe('locateGaplessTrack', () => {
  it('keeps the position inside the current track', () => {
    expect(locateGaplessTrack(tracks, 10)).toEqual({
      tlid: 1,
      index: 0,
      startSec: 0,
      offsetSec: 10,
    });
  });

  it('crosses the boundary into the next track', () => {
    expect(locateGaplessTrack(tracks, 180)).toEqual({
      tlid: 2,
      index: 1,
      startSec: 180,
      offsetSec: 0,
    });
    expect(locateGaplessTrack(tracks, 200).tlid).toBe(2);
    expect(locateGaplessTrack(tracks, 200).offsetSec).toBe(20);
  });

  it('stays on the last track after the album ends', () => {
    const place = locateGaplessTrack(tracks, 1000);
    expect(place.tlid).toBe(3);
    expect(place.offsetSec).toBe(1000 - 270);
  });

  it('returns null for an empty playlist', () => {
    expect(locateGaplessTrack([], 1)).toBeNull();
  });
});

describe('gapless url', () => {
  it('builds and recognizes the continuous stream url', () => {
    const url = gaplessUrl('http://10.0.0.5:9633', 'abc', 'flac');
    expect(url).toBe('http://10.0.0.5:9633/gapless/abc.flac');
    expect(isGaplessUrl(url, 'abc')).toBe(true);
    expect(isGaplessUrl('http://10.0.0.5:9633/stream/1/2.flac?start=0.000', 'abc')).toBe(false);
  });
});
