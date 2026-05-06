export interface LrcLine {
  timeMs: number
  text: string
}

const TIME_INNER = /^(\d+):(\d{2})(?:\.(\d{1,3}))?$/;

function timestampToMs(minutes: string, seconds: string, fraction?: string): number {
  const m = Number.parseInt(minutes, 10) || 0;
  const s = Number.parseInt(seconds, 10) || 0;
  const base = (m * 60 + s) * 1000;
  if (!fraction) return base;
  if (fraction.length >= 3) return base + Number.parseInt(fraction.slice(0, 3), 10);
  return base + Number.parseInt(fraction.padEnd(2, '0').slice(0, 2), 10) * 10;
}

function stripWordTimestamps(text: string): string {
  return text.replace(/<\d+:\d{2}(?:\.\d{1,3})?>/g, '').trim();
}

export function parseLrc(raw: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const close = trimmed.indexOf(']');
    if (close <= 1) continue;
    const inner = trimmed.slice(1, close);
    const mm = inner.match(TIME_INNER);
    if (!mm) continue;
    const rest = trimmed.slice(close + 1).trim();
    const text = stripWordTimestamps(rest);
    if (!text) continue;
    out.push({
      timeMs: timestampToMs(mm[1], mm[2], mm[3]),
      text,
    });
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

export function lrcToPlainText(lrc: string): string {
  return parseLrc(lrc)
    .map((l) => l.text)
    .join('\n');
}
