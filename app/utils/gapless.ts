export interface GaplessSpan {
  tlid: number
  durationSec: number
}

export interface GaplessPlace {
  tlid: number
  index: number
  startSec: number
  offsetSec: number
}

export function locateGaplessTrack(tracks: GaplessSpan[], absoluteSec: number): GaplessPlace | null {
  if (tracks.length === 0) return null;
  const absolute = Math.max(0, absoluteSec);
  let startSec = 0;
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];
    const end = startSec + track.durationSec;
    if (absolute < end || index === tracks.length - 1) {
      return {
        tlid: track.tlid,
        index,
        startSec,
        offsetSec: Math.max(0, absolute - startSec),
      };
    }
    startSec = end;
  }
  return null;
}

export function gaplessUrl(base: string, id: string, format: string) {
  return `${base}/gapless/${id}.${format}`;
}

export function isGaplessUrl(uri: string, id: string) {
  return uri.includes(`/gapless/${id}.`);
}
