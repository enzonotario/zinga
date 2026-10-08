import type { QueueTrack } from './playQueue';

const STREAM_URI_PATTERN = /\/(?:stream|file)\/(\d+)\/[0-9a-f]+\.(?:flac|mp3)\?start=([\d.]+)/;
const FILE_URI_PREFIX = 'file://';

export type StreamFormat = 'flac' | 'mp3';

export type StreamSource = { kind: 'tidal', id: string } | { kind: 'file', path: string };

export type PreparedSource = { kind: 'tidal', id: string } | { kind: 'file', token: string };

interface TrackUriItem {
  track?: Partial<Pick<QueueTrack, 'uri'>>
}

function getTidalTrackId(uri: string) {
  if (!uri.startsWith('tidal:track:')) return null;
  const id = uri.split(':').pop();
  return id && /^\d+$/.test(id) ? id : null;
}

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function getFilePath(uri: string) {
  if (!uri.startsWith(FILE_URI_PREFIX)) return null;
  const path = decodePath(uri.slice(FILE_URI_PREFIX.length));
  return path.startsWith('/') ? path : null;
}

export function getStreamSource(uri?: string): StreamSource | null {
  if (!uri) return null;
  const id = getTidalTrackId(uri);
  if (id) return { kind: 'tidal', id };
  const path = getFilePath(uri);
  return path ? { kind: 'file', path } : null;
}

export function canPlayDirect(tracklist: TrackUriItem[]) {
  return tracklist.length > 0 && tracklist.every((item) => getStreamSource(item.track?.uri) != null);
}

export function parseStreamUri(uri?: string | null) {
  const match = uri?.match(STREAM_URI_PATTERN);
  if (!match) return null;
  return { tlid: Number(match[1]), startSec: Number(match[2]) };
}

export function buildStreamUrl(base: string, tlid: number, source: PreparedSource, startSec: number, format: StreamFormat) {
  const path = source.kind === 'tidal' ? `stream/${tlid}/${source.id}` : `file/${tlid}/${source.token}`;
  return `${base}/${path}.${format}?start=${startSec.toFixed(3)}`;
}
