export function mimeTypeToCodec(mimeType: string): string {
  if (mimeType.includes('flac')) return 'Free Lossless Audio Codec (FLAC)';
  if (mimeType.includes('mp3')) return 'MPEG Audio Layer 3 (MP3)';
  if (mimeType.includes('mpeg')) return 'MPEG Audio';
  if (mimeType.includes('wav')) return 'Waveform Audio (WAV)';
  if (mimeType.includes('aac')) return 'Advanced Audio Coding (AAC)';
  if (mimeType.includes('ogg')) return 'Ogg Vorbis';
  return mimeType.toUpperCase();
}
export function extractCodecFromProtocolInfo(protocolInfo: string | null | undefined): string | null {
  if (!protocolInfo) return null;
  const mimeMatch = protocolInfo.match(/:[^:]+:([^:]+):/);
  if (mimeMatch && mimeMatch[1]) {
    return mimeTypeToCodec(mimeMatch[1]);
  }
  return null;
}
export function extractMetadataFromMalformedXML(xmlContent: string): {
  title: string | null
  artist: string | null
  album: string | null
  coverUrl: string | null
  date: string | null
  trackNumber: number | null
  streamServiceId: string | null
  streamUrl: string | null
  codec: string | null
  audioFormat: string | null
} {
  const titleMatch = xmlContent.match(/dc:title([^<]+)\/dc:title/);
  const creatorMatch = xmlContent.match(/dc:creator([^<]+)\/dc:creator/);
  const artistMatch = xmlContent.match(/upnp:artist([^<]+)\/upnp:artist/);
  let albumMatch = xmlContent.match(/\/dc:dateupnp:album([^/]+)\/upnp:album/);
  if (!albumMatch) {
    const allAlbumMatches = [...xmlContent.matchAll(/upnp:album([^/]+)\/upnp:album/g)];
    const validMatches = allAlbumMatches.filter((match) => {
      const beforeMatch = xmlContent.substring(0, match.index);
      return !beforeMatch.endsWith('ArtURI');
    });
    if (validMatches.length > 0) {
      albumMatch = validMatches[validMatches.length - 1];
    }
  }
  const albumArtMatch = xmlContent.match(/upnp:albumArtURI([^<]+)\/upnp:albumArtURI/);
  const dateMatch = xmlContent.match(/dc:date([^<]+)\/dc:date/);
  const trackNumberMatch = xmlContent.match(/upnp:originalTrackNumber(\d+)\/upnp:originalTrackNumber/);
  const streamServiceIdMatch = xmlContent.match(/item id=([^\s<>]+)/);
  let streamUrlMatch = xmlContent.match(/duration=[^h]*(https?:\/\/[^/<>"']+(?:\/[^\s<>"']*?)??)(?=\/res|$)/);
  if (!streamUrlMatch) {
    streamUrlMatch = xmlContent.match(/res[^>]*?(https?:\/\/[^\s<>"']+)/);
  }
  const bitsPerSampleMatch = xmlContent.match(/bitsPerSample=(\d+)/);
  const sampleFrequencyMatch = xmlContent.match(/sampleFrequency=(\d+)/);
  const nrAudioChannelsMatch = xmlContent.match(/nrAudioChannels=(\d+)/);
  const bitRateMatch = xmlContent.match(/bitRate=(\d+)/);
  const protocolInfoMatch = xmlContent.match(/protocolInfo=[^:]*:[^:]*:([^:;]+)/);
  const codec = protocolInfoMatch?.[1] ? mimeTypeToCodec(protocolInfoMatch[1]) : null;
  const bitrate = bitRateMatch?.[1] ? Number.parseFloat(bitRateMatch[1]) / 1000 : null;
  const sampleRate = sampleFrequencyMatch?.[1] ? Number.parseFloat(sampleFrequencyMatch[1]) / 1000 : null;
  const bps = bitsPerSampleMatch?.[1] ? Number.parseInt(bitsPerSampleMatch[1], 10) : null;
  const channels = nrAudioChannelsMatch?.[1] ? Number.parseInt(nrAudioChannelsMatch[1], 10) : null;
  const audioFormatParts: string[] = [];
  if (bitrate) audioFormatParts.push(`${bitrate.toFixed(2)} kbps`);
  if (sampleRate) audioFormatParts.push(`${sampleRate} kHz`);
  if (bps) audioFormatParts.push(`${bps} bits`);
  if (channels) audioFormatParts.push(`${channels} ch`);
  const audioFormat = audioFormatParts.length > 0 ? audioFormatParts.join(', ') : null;
  return {
    title: titleMatch?.[1]?.trim() || null,
    artist: (artistMatch?.[1] || creatorMatch?.[1])?.trim() || null,
    album: albumMatch?.[1]?.trim() || null,
    coverUrl: albumArtMatch?.[1]?.trim() || null,
    date: dateMatch?.[1]?.trim() || null,
    trackNumber: trackNumberMatch?.[1] ? Number.parseInt(trackNumberMatch[1], 10) : null,
    streamServiceId: streamServiceIdMatch?.[1]?.trim() || null,
    streamUrl: streamUrlMatch?.[1]?.trim() || null,
    codec: codec || null,
    audioFormat: audioFormat || null,
  };
}
export function parseXMLMetadata(xmlContent: string): {
  title: string | null
  artist: string | null
  album: string | null
  coverUrl: string | null
  codec: string | null
  audioFormat: string | null
  date: string | null
  trackNumber: number | null
  streamServiceId: string | null
  streamUrl: string | null
} | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) return null;
    const findElement = (selectors: string[], namespace?: string) => {
      for (const selector of selectors) {
        let el = doc.querySelector(selector);
        if (!el && namespace) {
          const elements = doc.getElementsByTagNameNS(namespace, selector.split(':').pop() || '');
          if (elements.length > 0) el = elements[0] || null;
        }
        if (el) return el;
      }
      return null;
    };
    const titleEl = findElement(['dc\\:title', 'title'], 'http://purl.org/dc/elements/1.1/');
    const artistEl = findElement(
      ['dc\\:creator', 'upnp\\:artist', 'creator', 'artist'],
      'urn:schemas-upnp-org:metadata-1-0/upnp/',
    );
    const albumEl = findElement(['upnp\\:album', 'album'], 'urn:schemas-upnp-org:metadata-1-0/upnp/');
    const albumArtEl = findElement(['upnp\\:albumArtURI', 'albumArtURI'], 'urn:schemas-upnp-org:metadata-1-0/upnp/');
    const dateEl = findElement(['dc\\:date', 'date'], 'http://purl.org/dc/elements/1.1/');
    const trackNumberEl = findElement(['upnp\\:originalTrackNumber', 'originalTrackNumber'], 'urn:schemas-upnp-org:metadata-1-0/upnp/');
    const resEl = doc.querySelector('res') || doc.querySelector('*|res');
    let codec: string | null = null;
    let audioFormat: string | null = null;
    if (resEl) {
      const protocolInfo = resEl.getAttribute('protocolInfo');
      if (protocolInfo) {
        codec = extractCodecFromProtocolInfo(protocolInfo);
      }
      const bitRate = resEl.getAttribute('bitRate');
      const sampleFreq = resEl.getAttribute('sampleFrequency');
      const bitsPerSample = resEl.getAttribute('bitsPerSample');
      const nrChannels = resEl.getAttribute('nrAudioChannels');
      const formatParts: string[] = [];
      if (bitRate) formatParts.push(`${(Number.parseFloat(bitRate) / 1000).toFixed(2)} kbps`);
      if (sampleFreq) formatParts.push(`${(Number.parseFloat(sampleFreq) / 1000)} kHz`);
      if (bitsPerSample) formatParts.push(`${bitsPerSample} bits`);
      if (nrChannels) formatParts.push(`${nrChannels} ch`);
      if (formatParts.length > 0) audioFormat = formatParts.join(', ');
    }
    const itemEl = doc.querySelector('item');
    const streamServiceId = itemEl?.getAttribute('id') || null;
    let streamUrl: string | null = null;
    if (resEl) {
      streamUrl = resEl.textContent?.trim() || null;
      if (!streamUrl) {
        const resContent = resEl.textContent || '';
        const urlMatch = resContent.match(/(https?:\/\/[^\s<>"']+)/);
        if (urlMatch) {
          streamUrl = urlMatch[1];
        }
      }
    }
    return {
      title: titleEl?.textContent?.trim() || null,
      artist: artistEl?.textContent?.trim() || null,
      album: albumEl?.textContent?.trim() || null,
      coverUrl: albumArtEl?.textContent?.trim() || null,
      codec: codec || null,
      audioFormat: audioFormat || null,
      date: dateEl?.textContent?.trim() || null,
      trackNumber: trackNumberEl?.textContent ? Number.parseInt(trackNumberEl.textContent, 10) : null,
      streamServiceId: streamServiceId || null,
      streamUrl: streamUrl || null,
    };
  } catch (e) {
    console.error('Error parsing XML metadata:', e);
    return null;
  }
}
