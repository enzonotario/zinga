import type { QueueTrack } from './playQueue';
import type { NormalizedTrack } from '~/providers/types';
import { normalizeTrack } from '~/providers/tidal/normalizer';

export function toQueueTrack(track: NormalizedTrack, album?: { title: string } | null): QueueTrack {
  return {
    uri: `tidal:track:${track.id}`,
    name: track.title,
    artists: track.artists.map((artist) => ({ name: artist.name })),
    album: album ? { name: album.title } : undefined,
    length: track.duration ? Math.round(track.duration * 1000) : undefined,
  };
}

export function tidalTrackInfoToQueueTrack(info: any): QueueTrack | null {
  const data = info?.track?.data ?? info?.track;
  if (!data?.id) return null;
  const included: any[] = info.track?.included ?? [];
  const track = normalizeTrack(data);
  const artists = track.artists.map((artist) => ({
    ...artist,
    name: included.find((item) => item.type === 'artists' && item.id === artist.id)?.attributes?.name ?? artist.name,
  }));
  const albumTitle = info.album?.data?.attributes?.title;
  return toQueueTrack({ ...track, artists }, albumTitle ? { title: albumTitle } : null);
}
