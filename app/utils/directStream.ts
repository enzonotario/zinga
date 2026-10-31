const STREAM_URI_PATTERN
  = /\/(?:stream|file)\/(\d+)\/[0-9a-f]+\.(?:flac|mp3)\?start=([\d.]+)/;
const YTM_STREAM_URI_PATTERN
  = /\/ytm\/(\d+)\/([\w-]{11})\.(?:flac|mp3)\?start=([\d.]+)/;
const FILE_URI_PREFIX = 'file://';
const YTM_VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export type StreamFormat = 'flac' | 'mp3';

export type StreamSource
  = | { kind: 'tidal', id: string }
    | { kind: 'file', path: string }
    | { kind: 'ytm', id: string };

export type PreparedSource
  = | { kind: 'tidal', id: string }
    | { kind: 'file', token: string }
    | { kind: 'ytm', id: string };

export function isYtmVideoId(id: string) {
  return YTM_VIDEO_ID_PATTERN.test(id);
}

function getTidalTrackId(uri: string) {
  if (!uri.startsWith('tidal:track:')) return null;
  const id = uri.split(':').pop();
  return id && /^\d+$/.test(id) ? id : null;
}

function getYtmTrackId(uri: string) {
  if (!uri.startsWith('ytm:track:')) return null;
  const id = uri.slice('ytm:track:'.length);
  return isYtmVideoId(id) ? id : null;
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
  const tidalId = getTidalTrackId(uri);
  if (tidalId) return { kind: 'tidal', id: tidalId };
  const ytmId = getYtmTrackId(uri);
  if (ytmId) return { kind: 'ytm', id: ytmId };
  const path = getFilePath(uri);
  return path ? { kind: 'file', path } : null;
}

export function parseStreamUri(uri?: string | null) {
  if (!uri) return null;
  const ytm = uri.match(YTM_STREAM_URI_PATTERN);
  if (ytm) {
    return { tlid: Number(ytm[1]), startSec: Number(ytm[3]) };
  }
  const match = uri.match(STREAM_URI_PATTERN);
  if (!match) return null;
  return { tlid: Number(match[1]), startSec: Number(match[2]) };
}

export function buildStreamUrl(
  base: string,
  tlid: number,
  source: PreparedSource,
  startSec: number,
  format: StreamFormat,
) {
  const path = source.kind === 'tidal'
    ? `stream/${tlid}/${source.id}`
    : source.kind === 'ytm'
      ? `ytm/${tlid}/${source.id}`
      : `file/${tlid}/${source.token}`;
  return `${base}/${path}.${format}?start=${startSec.toFixed(3)}`;
}
