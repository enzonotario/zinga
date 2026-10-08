import { describe, expect, it } from 'vitest';
import { extractTidalIdsFromUri } from './utils';

describe('extractTidalIdsFromUri', () => {
  it('should parse the long artist:album:track uri', () => {
    expect(extractTidalIdsFromUri('tidal:track:1:2:3')).toEqual({ artistId: '1', albumId: '2', trackId: '3' });
  });
  it('should parse the short track uri used by the play queue', () => {
    expect(extractTidalIdsFromUri('tidal:track:55163274')).toEqual({ trackId: '55163274' });
  });
  it('should ignore non TIDAL uris', () => {
    expect(extractTidalIdsFromUri('file:///music/a.flac')).toEqual({});
    expect(extractTidalIdsFromUri(undefined)).toEqual({});
  });
});
