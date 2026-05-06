import type { NormalizedAlbum, NormalizedArtist } from '~/providers/types';

export function mapDbAlbumToNormalized(album: any, artists: { id: string, name: string }[]): NormalizedAlbum {
  return {
    id: album.id,
    providerId: album.provider_id as 'tidal',
    title: album.title,
    artists,
    coverUrl: album.cover_url || undefined,
    releaseDate: album.release_date || undefined,
    numberOfTracks: album.number_of_tracks || undefined,
    numberOfVolumes: album.number_of_volumes || undefined,
    duration: album.duration || undefined,
    type: album.type as NormalizedAlbum['type'],
    explicit: album.explicit === 1,
    mediaTags: album.media_tags ? JSON.parse(album.media_tags) : undefined,
    audioQuality: album.audio_quality || undefined,
    copyright: album.copyright || undefined,
    barcodeId: album.barcode_id || undefined,
    label: album.label || undefined,
    genres: album.genres ? JSON.parse(album.genres) : undefined,
    tidalUrl: album.tidal_url || undefined,
    popularity: album.popularity || undefined,
    availability: album.availability ? JSON.parse(album.availability) : undefined,
    version: album.version || undefined,
    addedAt: album.added_at || undefined,
  };
}
export function mapDbArtistToNormalized(artist: any): NormalizedArtist {
  return {
    id: artist.id,
    providerId: artist.provider_id as 'tidal',
    name: artist.name,
    picture: artist.picture || undefined,
    biography: artist.biography || undefined,
    externalLinks: artist.external_links ? JSON.parse(artist.external_links) : undefined,
    tidalUrl: artist.tidal_url || undefined,
    popularity: artist.popularity || undefined,
    addedAt: artist.added_at || undefined,
  };
}
