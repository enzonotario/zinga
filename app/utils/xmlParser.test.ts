import { describe, expect, it } from 'vitest';
import { extractCodecFromProtocolInfo, extractMetadataFromMalformedXML, mimeTypeToCodec } from './xmlParser';

describe('xmlParser utils', () => {
  describe('mimeTypeToCodec', () => {
    it('should map mime types to readable codec names', () => {
      expect(mimeTypeToCodec('audio/flac')).toBe('Free Lossless Audio Codec (FLAC)');
      expect(mimeTypeToCodec('audio/mpeg')).toBe('MPEG Audio');
      expect(mimeTypeToCodec('audio/mp3')).toBe('MPEG Audio Layer 3 (MP3)');
      expect(mimeTypeToCodec('audio/wav')).toBe('Waveform Audio (WAV)');
      expect(mimeTypeToCodec('audio/aac')).toBe('Advanced Audio Coding (AAC)');
      expect(mimeTypeToCodec('unknown')).toBe('UNKNOWN');
    });
  });
  describe('extractCodecFromProtocolInfo', () => {
    it('should extract codec from protocol info string', () => {
      const protocolInfo = 'http-get:*:audio/flac:DLNA.ORG_PN=FLAC';
      expect(extractCodecFromProtocolInfo(protocolInfo)).toBe('Free Lossless Audio Codec (FLAC)');
    });
    it('should return null for invalid protocol info', () => {
      expect(extractCodecFromProtocolInfo(null)).toBeNull();
      expect(extractCodecFromProtocolInfo('')).toBeNull();
      expect(extractCodecFromProtocolInfo('invalid')).toBeNull();
    });
  });
  describe('extractMetadataFromMalformedXML', () => {
    it('should extract metadata from a typical malformed UPnP XML', () => {
      const xml = `
        <item id="123">
          dc:titleTest Title/dc:title
          dc:creatorTest Artist/dc:creator
          upnp:albumTest Album/upnp:album
          upnp:albumArtURIhttp://example.com/cover.jpg/upnp:albumArtURI
          dc:date2023-01-01/dc:date
          upnp:originalTrackNumber5/upnp:originalTrackNumber
          res protocolInfo="http-get:*:audio/flac:*" bitRate="800000" sampleFrequency="44100" bitsPerSample="16" nrAudioChannels="2" duration=00:00:00 http://example.com/stream.flac/res
        </item>
      `;
      const metadata = extractMetadataFromMalformedXML(xml);
      expect(metadata.title).toBe('Test Title');
      expect(metadata.artist).toBe('Test Artist');
      expect(metadata.album).toBe('Test Album');
      expect(metadata.coverUrl).toBe('http://example.com/cover.jpg');
      expect(metadata.date).toBe('2023-01-01');
      expect(metadata.trackNumber).toBe(5);
      expect(metadata.codec).toBe('Free Lossless Audio Codec (FLAC)');
    });
  });
});
