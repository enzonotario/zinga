export function buildAudioFormat(params: {
  bitrate?: number | null
  sampleRate?: number | null
  bitsPerSample?: number | null
  channels?: number | null
}): string | undefined {
  const { bitrate, sampleRate, bitsPerSample, channels } = params;
  const formatParts: string[] = [];
  if (bitrate) formatParts.push(`${bitrate.toFixed(2)} kbps`);
  if (sampleRate) formatParts.push(`${sampleRate} kHz`);
  if (bitsPerSample) formatParts.push(`${bitsPerSample} bits`);
  if (channels) formatParts.push(`${channels} ch`);
  return formatParts.length > 0 ? formatParts.join(', ') : undefined;
}
export function parseBitrate(bitRateStr: string | null | undefined): number | null {
  if (!bitRateStr) return null;
  return Number.parseFloat(bitRateStr) / 1000;
}
export function parseSampleRate(sampleFreqStr: string | null | undefined): number | null {
  if (!sampleFreqStr) return null;
  return Number.parseFloat(sampleFreqStr) / 1000;
}
