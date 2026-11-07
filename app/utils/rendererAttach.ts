import type { GaplessSpan } from './gapless';
import type { QueueItem } from './playQueue';
import { getStreamSource, parseStreamUri } from './directStream';
import { locateGaplessTrack } from './gapless';

const GAPLESS_ID_PATTERN = /\/gapless\/([0-9a-f]+)\.(?:flac|mp3)(?:$|[?#])/;
const DIRECT_SOURCE_PATTERN = /\/(stream|file|ytm)\/\d+\/([\w-]+)\.(?:flac|mp3)\?/;

export interface GaplessSessionInfo {
  id: string
  tracks: { tlid: number, durationMs: number, startMs: number }[]
}

export interface AttachInput {
  trackUri: string
  streamPositionSec: number
  baseUrl: string
  items: QueueItem[]
  gapless?: GaplessSessionInfo | null
}

export interface AttachTarget {
  tlid: number
  startOffsetSec: number
  trackPositionSec: number
  gapless: { id: string, tracks: GaplessSpan[] } | null
}

export function gaplessSessionId(trackUri: string) {
  return trackUri.match(GAPLESS_ID_PATTERN)?.[1] ?? null;
}

function isOwnStream(trackUri: string, baseUrl: string) {
  return !!baseUrl && trackUri.startsWith(`${baseUrl}/`);
}

function sourceMatches(item: QueueItem, trackUri: string) {
  const match = trackUri.match(DIRECT_SOURCE_PATTERN);
  const source = getStreamSource(item.track.uri);
  if (!match || !source) return false;
  const [, route, id] = match;
  if (route === 'file') return source.kind === 'file';
  if (route === 'ytm') return source.kind === 'ytm' && source.id === id;
  return source.kind === 'tidal' && source.id === id;
}

function resolveGapless(id: string, input: AttachInput): AttachTarget | null {
  const info = input.gapless;
  const first = info?.tracks[0];
  if (!info || info.id !== id || !first) return null;
  const tracks = info.tracks.map((track) => ({ tlid: track.tlid, durationSec: track.durationMs / 1000 }));
  const startOffsetSec = first.startMs / 1000;
  const place = locateGaplessTrack(tracks, startOffsetSec + input.streamPositionSec);
  if (!place || !input.items.some((item) => item.tlid === place.tlid)) return null;
  return {
    tlid: place.tlid,
    startOffsetSec,
    trackPositionSec: place.offsetSec,
    gapless: { id, tracks },
  };
}

export function resolveAttachTarget(input: AttachInput): AttachTarget | null {
  if (!isOwnStream(input.trackUri, input.baseUrl)) return null;
  const gaplessId = gaplessSessionId(input.trackUri);
  if (gaplessId) return resolveGapless(gaplessId, input);
  const parsed = parseStreamUri(input.trackUri);
  if (!parsed) return null;
  const item = input.items.find((candidate) => candidate.tlid === parsed.tlid);
  if (!item || !sourceMatches(item, input.trackUri)) return null;
  return {
    tlid: item.tlid,
    startOffsetSec: parsed.startSec,
    trackPositionSec: parsed.startSec + input.streamPositionSec,
    gapless: null,
  };
}
