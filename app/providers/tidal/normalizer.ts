import type {
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedCredit,
  NormalizedSimilarArtist,
  NormalizedTrack,
} from '../types';

export function normalizeArtist(data: any, included: any[] = [], meta?: { addedAt?: string }): NormalizedArtist {
  const biographyRef = data?.relationships?.biography?.data;
  let biography: string | undefined;
  if (biographyRef && included.length > 0) {
    const biographyItem = included.find(
      (item: any) => item.type === 'artistBiographies' && item.id === biographyRef.id,
    );
    biography = biographyItem?.attributes?.text;
  }
  const picture = extractArtworkUrl(data, included, 'profileArt', 640);
  const tidalUrl = extractTidalUrl(data.attributes?.externalLinks);
  return {
    id: data.id,
    providerId: 'tidal',
    name: data.attributes?.name || 'Unknown artist',
    picture,
    biography,
    tidalUrl,
    popularity: data.attributes?.popularity,
    addedAt: meta?.addedAt,
  };
}
export function normalizeSimilarArtist(data: any, included: any[] = []): NormalizedSimilarArtist {
  const artistIncluded = included.find((item: any) => item.type === 'artists' && item.id === data.id);
  const artistData = artistIncluded || data;
  const artistWithIncluded = { ...artistData, relationships: artistData.relationships || data.relationships };
  const picture = extractArtworkUrl(artistWithIncluded, included, 'profileArt', 320);
  return {
    id: data.id,
    name: artistData?.attributes?.name || data.attributes?.name || 'Unknown artist',
    picture,
  };
}
export function normalizeAlbum(data: any, included: any[] = [], meta?: { addedAt?: string }): NormalizedAlbum {
  const coverUrl = extractArtworkUrl(data, included, 'coverArt', 640);
  const artists = (data?.relationships?.artists?.data || []).map((a: any) => {
    const artistIncluded = included.find((item: any) => item.type === 'artists' && item.id === a.id);
    return {
      id: a.id,
      name: artistIncluded?.attributes?.name || a.attributes?.name || 'Unknown artist',
    };
  });
  const genres = (data?.relationships?.genres?.data || []).map((g: any) => {
    const genreIncluded = included.find((item: any) => item.type === 'genres' && item.id === g.id);
    return genreIncluded?.attributes?.name || g.attributes?.name;
  }).filter(Boolean);
  const providers = (data?.relationships?.providers?.data || []).map((p: any) => {
    const providerIncluded = included.find((item: any) => item.type === 'providers' && item.id === p.id);
    return providerIncluded?.attributes?.name || p.attributes?.name;
  }).filter(Boolean);
  const copyright = data.attributes?.copyright?.text || '';
  let label = providers.length > 0 ? providers[0] : undefined;
  if (!label) {
    label = copyright
      .replace(/^[\s\w℗©]*[℗©][\s\w]*/, '')
      .trim() || undefined;
  }
  const tidalUrl = extractTidalUrl(data.attributes?.externalLinks);
  return {
    id: data.id,
    providerId: 'tidal',
    title: data.attributes?.title || 'Unknown album',
    artists,
    coverUrl,
    releaseDate: data.attributes?.releaseDate,
    numberOfTracks: data.attributes?.numberOfItems,
    numberOfVolumes: data.attributes?.numberOfVolumes,
    duration: parseISODurationToSeconds(data.attributes?.duration),
    type: data.attributes?.type || 'ALBUM',
    explicit: data.attributes?.explicit || false,
    mediaTags: data.attributes?.mediaTags || [],
    audioQuality: data.attributes?.audioQuality,
    copyright,
    barcodeId: data.attributes?.barcodeId,
    label,
    genres,
    tidalUrl,
    popularity: data.attributes?.popularity,
    availability: data.attributes?.availability,
    version: data.attributes?.version,
    addedAt: meta?.addedAt,
  };
}
export function normalizeTrack(data: any, meta?: any): NormalizedTrack {
  const artists = (data?.relationships?.artists?.data || []).map((a: any) => ({
    id: a.id,
    name: a.attributes?.name || 'Unknown artist',
  }));
  const rawDuration = data?.attributes?.duration;
  const duration = typeof rawDuration === 'number'
    ? rawDuration
    : parseISODurationToSeconds(rawDuration);
  return {
    id: data.id,
    providerId: 'tidal',
    title: data.attributes?.title || data.attributes?.name || 'Unknown title',
    artists,
    duration,
    trackNumber: meta?.trackNumber || data.meta?.trackNumber,
    volumeNumber: meta?.volumeNumber || data.meta?.volumeNumber,
    explicit: data.attributes?.explicit || false,
    isrc: data.attributes?.isrc,
    copyright: data.attributes?.copyright,
  };
}
export function normalizeCredit(data: any): NormalizedCredit {
  return {
    name: data.attributes?.name || '',
    role: data.attributes?.role || 'Other',
  };
}
export function extractArtworkUrl(entity: any, included: any[], artworkType: 'profileArt' | 'coverArt', minWidth = 320): string | undefined {
  const artworkRelation = entity?.relationships?.[artworkType];
  const artworkData = artworkRelation?.data;
  if (!artworkData?.length) return undefined;
  const artworkId = artworkData[0]?.id;
  if (!artworkId) return undefined;
  const artwork = included.find((item: any) => item.type === 'artworks' && item.id === artworkId);
  if (!artwork?.attributes?.files?.length) return undefined;
  const files = artwork.attributes.files;
  const suitable = files.find((f: any) => f.meta?.width >= minWidth) || files[files.length - 1];
  return suitable?.href;
}
function parseISODurationToSeconds(duration?: string): number | undefined {
  if (!duration) return undefined;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return undefined;
  const hours = Number.parseInt(match[1] || '0', 10);
  const minutes = Number.parseInt(match[2] || '0', 10);
  const seconds = Number.parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
function extractTidalUrl(externalLinks?: { href: string, meta?: { type: string } }[]): string | undefined {
  if (!externalLinks?.length) return undefined;
  const tidalLink = externalLinks.find((link) => link.meta?.type === 'TIDAL_SHARING');
  return tidalLink?.href;
}
export function normalizeSearchArtist(data: any, included: any[] = []): NormalizedArtist {
  return {
    id: data.id,
    providerId: 'tidal',
    name: data.attributes?.name || 'Unknown artist',
    picture: extractArtworkUrl(data, included, 'profileArt', 320),

  };
}
export function normalizeSearchAlbum(data: any, included: any[] = []): NormalizedAlbum {
  const artists = (data?.relationships?.artists?.data || []).map((a: any) => {
    const artistIncluded = included.find((item: any) => item.type === 'artists' && item.id === a.id);
    return {
      id: a.id,
      name: artistIncluded?.attributes?.name || a.attributes?.name || 'Unknown artist',
    };
  });
  return {
    id: data.id,
    providerId: 'tidal',
    title: data.attributes?.title || 'Unknown album',
    artists,
    coverUrl: extractArtworkUrl(data, included, 'coverArt', 320),
    releaseDate: data.attributes?.releaseDate,
    type: data.attributes?.type,
    explicit: data.attributes?.explicit,
  };
}
export function normalizeSearchTrack(data: any, included: any[] = []): NormalizedTrack {
  const artists = (data?.relationships?.artists?.data || []).map((a: any) => {
    const artistIncluded = included.find((item: any) => item.type === 'artists' && item.id === a.id);
    return {
      id: a.id,
      name: artistIncluded?.attributes?.name || a.attributes?.name || 'Unknown artist',
    };
  });
  return {
    id: data.id,
    providerId: 'tidal',
    title: data.attributes?.title || data.attributes?.name || 'Unknown title',
    artists,
    duration: parseISODurationToSeconds(data.attributes?.duration),
    explicit: data.attributes?.explicit,
  };
}
