import { describe, expect, it, vi } from 'vitest';
import * as tidalUtils from './tidal';
import { fetchTidalMetadata } from './tidalMetadata';

vi.mock('./tidal', () => ({
  getTidalTrackInfo: vi.fn(),
}));
describe('fetchTidalMetadata', () => {
  const mockTidalArtwork = {
    getArtworkUrl: vi.fn(),
    getAlbumCover: vi.fn(),
    getArtistPicture: vi.fn(),
  };
  const mockTidalAuth = {
    getArtist: vi.fn(),
  };
  it('should return null if no tidal data is found', async () => {
    vi.mocked(tidalUtils.getTidalTrackInfo).mockResolvedValue(null);
    const result = await fetchTidalMetadata('tidal:track:123', mockTidalArtwork, mockTidalAuth);
    expect(result).toBeNull();
  });
  it('should fetch and format tidal metadata correctly', async () => {
    const mockTidalData = {
      track: {
        data: { id: 'track123', attributes: { title: 'Test Track' } },
        included: [],
      },
      album: {
        data: { id: 'album123', attributes: { title: 'Test Album' } },
        included: [{ type: 'coverArt', id: 'cover123' }],
      },
      artist: {
        data: { id: 'artist123', attributes: { name: 'Test Artist' } },
        included: [{ type: 'profileArt', id: 'profile123' }],
      },
    };
    vi.mocked(tidalUtils.getTidalTrackInfo).mockResolvedValue(mockTidalData);
    mockTidalArtwork.getArtworkUrl.mockImplementation((data: any, size: number) => {
      if (size === 640) return 'http://example.com/cover.jpg';
      if (size === 320) return 'http://example.com/artist.jpg';
      return null;
    });
    const result = await fetchTidalMetadata('tidal:track:track123', mockTidalArtwork, mockTidalAuth);
    expect(result).toEqual({
      uri: 'tidal:track:track123',
      track: {
        ...mockTidalData.track.data,
        included: [],
      },
      album: mockTidalData.album,
      artist: mockTidalData.artist,
      coverUrl: 'http://example.com/cover.jpg',
      artistPicture: 'http://example.com/artist.jpg',
    });
  });
  it('should fallback to direct artwork fetching if URL is not in included data', async () => {
    const mockTidalData = {
      track: { id: 'track123' },
      album: { data: { id: 'album123' }, included: [] },
      artist: { data: { id: 'artist123' }, included: [] },
    };
    vi.mocked(tidalUtils.getTidalTrackInfo).mockResolvedValue(mockTidalData);
    mockTidalArtwork.getArtworkUrl.mockReturnValue(null);
    mockTidalArtwork.getAlbumCover.mockResolvedValue('http://example.com/fallback-cover.jpg');
    mockTidalArtwork.getArtistPicture.mockResolvedValue('http://example.com/fallback-artist.jpg');
    const result = await fetchTidalMetadata('tidal:track:track123', mockTidalArtwork, mockTidalAuth);
    expect(result?.coverUrl).toBe('http://example.com/fallback-cover.jpg');
    expect(result?.artistPicture).toBe('http://example.com/fallback-artist.jpg');
  });
});
