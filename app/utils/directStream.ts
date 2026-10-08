import type { MopidyTlTrack } from '~/composables/useMopidy';

const STREAM_URI_PATTERN = /\/stream\/(\d+)\/\d+\.flac\?start=([\d.]+)/;

interface TrackUriItem {
  track?: Partial<Pick<MopidyTlTrack['track'], 'uri'>>
}

export function getTidalTrackId(uri?: string) {
  if (!uri?.startsWith('tidal:track:')) return null;
  const id = uri.split(':').pop();
  return id && /^\d+$/.test(id) ? id : null;
}

export function canPlayDirect(tracklist: TrackUriItem[]) {
  return tracklist.length > 0 && tracklist.every((item) => getTidalTrackId(item.track?.uri) != null);
}

export function parseStreamUri(uri?: string | null) {
  const match = uri?.match(STREAM_URI_PATTERN);
  if (!match) return null;
  return { tlid: Number(match[1]), startSec: Number(match[2]) };
}

export function buildStreamUrl(base: string, tlid: number, trackId: string, startSec: number) {
  return `${base}/stream/${tlid}/${trackId}.flac?start=${startSec.toFixed(3)}`;
}
