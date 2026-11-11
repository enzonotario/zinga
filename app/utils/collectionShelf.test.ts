import { describe, expect, it } from 'vitest';
import {
  applySubsetOrder,
  COLOR_BAND_SWATCHES,
  quickJumpLetters,
  reorderIds,
  sameOrder,
  suggestArtistSortName,
  tidalCoverAtSize,
} from './collectionShelf';
import { COLOR_BANDS } from './collectionSort';

describe('suggestArtistSortName', () => {
  it('moves the last word to the front', () => {
    expect(suggestArtistSortName('Charly García')).toBe('García, Charly');
    expect(suggestArtistSortName('Luis Alberto Spinetta')).toBe('Spinetta, Luis Alberto');
  });

  it('moves leading articles to the end', () => {
    expect(suggestArtistSortName('The Beatles')).toBe('Beatles, The');
    expect(suggestArtistSortName('Los Fabulosos Cadillacs')).toBe('Fabulosos Cadillacs, Los');
  });

  it('keeps single words, existing sort names and blanks', () => {
    expect(suggestArtistSortName('Sumo')).toBe('Sumo');
    expect(suggestArtistSortName('García, Charly')).toBe('García, Charly');
    expect(suggestArtistSortName('   ')).toBe('');
  });

  it('normalizes whitespace', () => {
    expect(suggestArtistSortName('  Fito   Páez ')).toBe('Páez, Fito');
  });
});

describe('quickJumpLetters', () => {
  it('lists the alphabet with # first and marks available groups', () => {
    const letters = quickJumpLetters([{ key: '#' }, { key: 'A' }, { key: 'C' }, { key: '__various__' }]);
    expect(letters).toHaveLength(27);
    expect(letters[0]).toEqual({ letter: '#', groupKey: '#' });
    expect(letters.find((l) => l.letter === 'A')!.groupKey).toBe('A');
    expect(letters.find((l) => l.letter === 'B')!.groupKey).toBeNull();
  });

  it('puts # last when numbers go last and inserts Ñ after N only when present', () => {
    const letters = quickJumpLetters([{ key: 'Ñ' }], false);
    expect(letters.at(-1)!.letter).toBe('#');
    const n = letters.findIndex((l) => l.letter === 'N');
    expect(letters[n + 1]).toEqual({ letter: 'Ñ', groupKey: 'Ñ' });
    expect(quickJumpLetters([]).some((l) => l.letter === 'Ñ')).toBe(false);
  });
});

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves before or after the target', () => {
    expect(reorderIds(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderIds(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderIds(ids, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
  });

  it('returns a copy when nothing moves', () => {
    expect(reorderIds(ids, 'a', 'a', 'before')).toEqual(ids);
    expect(reorderIds(ids, 'x', 'a', 'before')).toEqual(ids);
    expect(reorderIds(ids, 'a', 'b', 'before')).not.toBe(ids);
  });
});

describe('applySubsetOrder', () => {
  it('permutes only the slots taken by the visible subset', () => {
    expect(applySubsetOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b'])).toEqual(['a', 'd', 'c', 'b', 'e']);
  });

  it('ignores ids that are not in the full list', () => {
    expect(applySubsetOrder(['a', 'b'], ['x', 'b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('sameOrder', () => {
  it('compares id sequences', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('tidalCoverAtSize', () => {
  it('rewrites TIDAL image sizes only', () => {
    expect(tidalCoverAtSize('https://resources.tidal.com/images/44/5f/640x640.jpg', 320))
      .toBe('https://resources.tidal.com/images/44/5f/320x320.jpg');
    expect(tidalCoverAtSize('https://example.com/images/640x640.jpg', 320)).toBe('https://example.com/images/640x640.jpg');
    expect(tidalCoverAtSize(undefined, 320)).toBeUndefined();
  });
});

describe('color band swatches', () => {
  it('has a swatch for every band', () => {
    expect(Object.keys(COLOR_BAND_SWATCHES).sort()).toEqual([...COLOR_BANDS].sort());
  });
});
