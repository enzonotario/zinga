export function cursorParam(cursor?: string): { 'page[cursor]': string } | Record<string, never> {
  if (!cursor) return {};
  let trimmed = cursor;
  while (trimmed.endsWith('=')) {
    trimmed = trimmed.slice(0, -1);
  }
  return { 'page[cursor]': trimmed };
}
export function parseTidalUrls(streamServiceId?: string): {
  artist?: string
  album?: string
  albumCredits?: string
} {
  if (!streamServiceId || !streamServiceId.startsWith('tidal/')) {
    return {};
  }
  const parts = streamServiceId.split('/');
  if (parts.length >= 4 && parts[0] === 'tidal' && parts[1] === 'search' && parts[2] === 'artists') {
    const artistId = parts[3];
    const albumId = parts[4];
    const urls: { artist?: string, album?: string, albumCredits?: string } = {};
    if (artistId) {
      urls.artist = `https://tidal.com/artist/${artistId}`;
    }
    if (albumId) {
      urls.album = `https://tidal.com/album/${albumId}`;
      urls.albumCredits = `https://tidal.com/album/${albumId}/credits`;
    }
    return urls;
  }
  return {};
}
function cleanTidalId(id?: string): string | undefined {
  if (!id) return undefined;
  const match = id.match(/^(\d+)/);
  return match ? match[1] : id;
}
export function extractTidalIdsFromUri(uri?: string): {
  artistId?: string
  albumId?: string
  trackId?: string
} {
  if (!uri) return {};
  const uriMatch = uri.match(/tidal:track:(\d+):(\d+):(\d+)/);
  if (uriMatch) {
    return {
      artistId: uriMatch[1],
      albumId: uriMatch[2],
      trackId: uriMatch[3],
    };
  }
  const urlMatch = uri.match(/\/tidal:track:(\d+):(\d+):(\d+)/);
  if (urlMatch) {
    return {
      artistId: urlMatch[1],
      albumId: urlMatch[2],
      trackId: urlMatch[3],
    };
  }
  return {};
}
export function extractTidalIds(streamServiceId?: string): {
  artistId?: string
  albumId?: string
  trackId?: string
} {
  if (!streamServiceId) {
    return {};
  }
  if (streamServiceId.startsWith('tidal/')) {
    const parts = streamServiceId.split('/');
    if (parts.length >= 4 && parts[0] === 'tidal' && parts[1] === 'search' && parts[2] === 'artists') {
      return {
        artistId: cleanTidalId(parts[3]),
        albumId: cleanTidalId(parts[4]),
        trackId: cleanTidalId(parts[5]),
      };
    }
  }
  return extractTidalIdsFromUri(streamServiceId);
}
