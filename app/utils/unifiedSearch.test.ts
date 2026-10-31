import { describe, expect, it } from 'vitest';
import {
  emptyTidalSearchResults,
  emptyYtmSearchResults,
  hasUnifiedResults,
  showTidalResults,
  showYtmResults,
  tidalResultCount,
  ytmResultCount,
} from './unifiedSearch';

describe('unifiedSearch utils', () => {
  it('should create empty result shells', () => {
    expect(emptyTidalSearchResults()).toEqual({ artists: [], albums: [], tracks: [] });
    expect(emptyYtmSearchResults()).toEqual({ tracks: [], albums: [], artists: [], videos: [] });
  });

  it('should count and detect results per source filter', () => {
    const tidal = {
      artists: [{ id: '1', providerId: 'tidal' as const, name: 'A' }],
      albums: [],
      tracks: [],
    };
    const ytm = emptyYtmSearchResults();
    ytm.videos = [{
      videoId: 'dQw4w9WgXcQ',
      title: 'V',
      artists: [{ name: 'X' }],
    }];
    expect(tidalResultCount(tidal)).toBe(1);
    expect(ytmResultCount(ytm)).toBe(1);
    expect(hasUnifiedResults(tidal, ytm, 'all')).toBe(true);
    expect(hasUnifiedResults(tidal, emptyYtmSearchResults(), 'ytm')).toBe(false);
    expect(hasUnifiedResults(emptyTidalSearchResults(), ytm, 'tidal')).toBe(false);
    expect(showTidalResults('all')).toBe(true);
    expect(showTidalResults('ytm')).toBe(false);
    expect(showYtmResults('tidal')).toBe(false);
    expect(showYtmResults('ytm')).toBe(true);
  });
});
