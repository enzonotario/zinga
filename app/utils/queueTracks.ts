import type { QueueTrack } from './playQueue';
import type { YtmAlbumDetail, YtmAlbumTrack, YtmTrack } from '~/composables/useYoutubeMusic';
import type { NormalizedTrack } from '~/providers/types';
import { normalizeTrack } from '~/providers/tidal/normalizer';
import { isYtmVideoId } from './directStream';

interface QueueAlbum {
  title: string
  artists?: { name: string }[]
  uri?: string
}

export interface YtmSearchTrack {
  videoId: string
  title: string
  artists: { id?: string | null, name: string }[]
  album?: { id?: string | null, name: string } | null
  durationSec?: number | null
  thumbnailUrl?: string | null
}

function namedArtists(artists: { name: string }[] = []) {
  return artists.filter((artist) => artist.name?.trim()).map((artist) => ({ name: artist.name }));
}

function ytmAlbumUri(albumId?: string | null) {
  return albumId && /^[\w-]+$/.test(albumId) ? `ytm:album:${albumId}` : undefined;
}

export function toQueueTrack(track: NormalizedTrack, album?: QueueAlbum | null): QueueTrack {
  const artists = namedArtists(track.artists);
  return {
    uri: `tidal:track:${track.id}`,
    name: track.title,
    artists: artists.length ? artists : namedArtists(album?.artists),
    album: album ? { name: album.title, uri: album.uri } : undefined,
    length: track.duration ? Math.round(track.duration * 1000) : undefined,
    ...(track.coverUrl ? { coverUrl: track.coverUrl } : {}),
  };
}

export function ytmSearchTrackToQueueTrack(track: YtmSearchTrack): QueueTrack | null {
  if (!isYtmVideoId(track.videoId)) return null;
  const artists = namedArtists(track.artists);
  const albumName = track.album?.name?.trim();
  const albumUri = ytmAlbumUri(track.album?.id);
  return {
    uri: `ytm:track:${track.videoId}`,
    name: track.title,
    artists: artists.length ? artists : [{ name: 'Unknown' }],
    album: albumName ? { name: albumName, uri: albumUri } : undefined,
    length: typeof track.durationSec === 'number' && Number.isFinite(track.durationSec)
      ? Math.round(track.durationSec * 1000)
      : undefined,
    coverUrl: track.thumbnailUrl || undefined,
  };
}

export function ytmAlbumTrackToQueueTrack(
  track: YtmAlbumTrack,
  album: Pick<YtmAlbumDetail, 'id' | 'title' | 'thumbnailUrl'>,
): QueueTrack | null {
  if (!isYtmVideoId(track.videoId)) return null;
  const artists = namedArtists(track.artists);
  return {
    uri: `ytm:track:${track.videoId}`,
    name: track.title,
    artists: artists.length ? artists : [{ name: 'Unknown' }],
    album: {
      name: album.title,
      uri: ytmAlbumUri(album.id),
    },
    length: typeof track.durationSec === 'number' && Number.isFinite(track.durationSec)
      ? Math.round(track.durationSec * 1000)
      : undefined,
    coverUrl: album.thumbnailUrl || undefined,
  };
}

export function ytmTopSongToQueueTrack(track: YtmTrack): QueueTrack | null {
  return ytmSearchTrackToQueueTrack(track);
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
