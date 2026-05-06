import { describe, expect, it } from 'vitest';
import { stripWimpLinks } from './wimpText';

describe('stripWimpLinks', () => {
  it('should return empty string for null, undefined, or empty string', () => {
    expect(stripWimpLinks(null)).toBe('');
    expect(stripWimpLinks(undefined)).toBe('');
    expect(stripWimpLinks('')).toBe('');
  });
  it('should return the same text if it has no wimpLinks', () => {
    const input = 'Simple text without links';
    expect(stripWimpLinks(input)).toBe(input);
  });
  it('should strip a single wimpLink and keep the text content', () => {
    const input = 'This is an [wimpLink artistId="12345"]Artist Name[/wimpLink] link.';
    const expected = 'This is an Artist Name link.';
    expect(stripWimpLinks(input)).toBe(expected);
  });
  it('should strip multiple wimpLinks and keep all text content', () => {
    const input = 'Check [wimpLink albumId="1"]Album 1[/wimpLink] and [wimpLink albumId="2"]Album 2[/wimpLink].';
    const expected = 'Check Album 1 and Album 2.';
    expect(stripWimpLinks(input)).toBe(expected);
  });
  it('should handle nested or malformed-like content within wimpLink', () => {
    const input = '[wimpLink artistId="123"]Artist (With Parens)[/wimpLink]';
    const expected = 'Artist (With Parens)';
    expect(stripWimpLinks(input)).toBe(expected);
  });
  it('should reduce extra whitespace and trim the result', () => {
    const input = '   Text    with   many    spaces   ';
    const expected = 'Text with many spaces';
    expect(stripWimpLinks(input)).toBe(expected);
  });
  it('should handle combination of links and extra whitespace', () => {
    const input = '   [wimpLink artistId="456"] Artist [/wimpLink]   and   [wimpLink albumId="789"] Album [/wimpLink]   ';
    const expected = 'Artist and Album';
    expect(stripWimpLinks(input)).toBe(expected);
  });
  it('should handle complex artist IDs', () => {
    const input = '[wimpLink artistId="10203040"]Very Long ID[/wimpLink]';
    const expected = 'Very Long ID';
    expect(stripWimpLinks(input)).toBe(expected);
  });
});
