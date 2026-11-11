import type { CollectionSortConfig, CoverColor, SortRule } from './collectionSort';
import type { NormalizedAlbum } from '~/providers/types';
import { describe, expect, it } from 'vitest';
import {
  applyCollectionSortPreset,
  artistSortName,
  COLLECTION_SORT_PRESETS,
  colorBand,
  colorRank,
  createCollectionSortConfig,
  DEFAULT_COLLECTION_SORT_CONFIG,
  DEFAULT_COLLECTION_SORT_OPTIONS,
  groupCollection,
  isVariousArtists,
  matchCollectionSortPreset,
  normalizeCollectionSortConfig,
  sortCollection,
  sortLetter,
  stripArticle,
} from './collectionSort';

let seq = 0;

function album(partial: Partial<NormalizedAlbum> & { artist?: string, artistId?: string } = {}): NormalizedAlbum {
  seq += 1;
  const { artist, artistId, ...rest } = partial;
  const name = artist ?? 'Artist';
  return {
    id: `al-${seq}`,
    providerId: 'tidal',
    title: `Album ${seq}`,
    artists: artist === '' ? [] : [{ id: artistId ?? `ar-${name}`, name }],
    type: 'ALBUM',
    ...rest,
  };
}

function config(rules: SortRule[], overrides: Partial<CollectionSortConfig> = {}): CollectionSortConfig {
  return {
    preset: null,
    rules,
    groupBy: 'none',
    options: { ...DEFAULT_COLLECTION_SORT_OPTIONS },
    ...overrides,
  };
}

function titles(list: NormalizedAlbum[]): string[] {
  return list.map((a) => a.title);
}

const asc = (key: SortRule['key']): SortRule => ({ key, desc: false });
const desc = (key: SortRule['key']): SortRule => ({ key, desc: true });

describe('stripArticle', () => {
  it('removes leading articles case-insensitively', () => {
    expect(stripArticle('The Beatles')).toBe('Beatles');
    expect(stripArticle('the cure')).toBe('cure');
    expect(stripArticle('Los Fabulosos Cadillacs')).toBe('Fabulosos Cadillacs');
    expect(stripArticle('Las Pelotas')).toBe('Pelotas');
    expect(stripArticle('La Renga')).toBe('Renga');
    expect(stripArticle('El Mató a un Policía Motorizado')).toBe('Mató a un Policía Motorizado');
    expect(stripArticle('Les Luthiers')).toBe('Luthiers');
    expect(stripArticle('Die Ärzte')).toBe('Ärzte');
    expect(stripArticle('A Tribe Called Quest')).toBe('Tribe Called Quest');
  });

  it('keeps names that only look like articles', () => {
    expect(stripArticle('Theodore')).toBe('Theodore');
    expect(stripArticle('Lali')).toBe('Lali');
    expect(stripArticle('A-ha')).toBe('A-ha');
    expect(stripArticle('The')).toBe('The');
    expect(stripArticle('Elvis Presley')).toBe('Elvis Presley');
  });
});

describe('sortLetter', () => {
  it('maps accented letters to their base letter', () => {
    expect(sortLetter('Árbol')).toBe('A');
    expect(sortLetter('élan')).toBe('E');
    expect(sortLetter('Ñandú')).toBe('Ñ');
  });

  it('groups digits and symbols under #', () => {
    expect(sortLetter('2Pac')).toBe('#');
    expect(sortLetter('¡Hola!')).toBe('#');
    expect(sortLetter('')).toBe('#');
  });
});

describe('isVariousArtists', () => {
  it('detects compilations and various artists names', () => {
    expect(isVariousArtists(album({ type: 'COMPILATION', artist: 'Charly García' }))).toBe(true);
    expect(isVariousArtists(album({ artist: 'Various Artists' }))).toBe(true);
    expect(isVariousArtists(album({ artist: 'Varios Artistas' }))).toBe(true);
    expect(isVariousArtists(album({ artist: '' }))).toBe(true);
    expect(isVariousArtists(album({ artist: 'Variations' }))).toBe(false);
  });
});

describe('artistSortName', () => {
  it('prefers the user override and keeps it verbatim', () => {
    const a = album({ artist: 'Charly García', artistId: 'charly' });
    expect(artistSortName(a, DEFAULT_COLLECTION_SORT_OPTIONS, { artistSortNames: { charly: 'García, Charly' } })).toBe('García, Charly');
    expect(artistSortName(a, DEFAULT_COLLECTION_SORT_OPTIONS)).toBe('Charly García');
  });

  it('only strips articles when enabled', () => {
    const a = album({ artist: 'The Doors' });
    expect(artistSortName(a, DEFAULT_COLLECTION_SORT_OPTIONS)).toBe('Doors');
    expect(artistSortName(a, { ...DEFAULT_COLLECTION_SORT_OPTIONS, ignoreArticles: false })).toBe('The Doors');
  });
});

describe('sortCollection', () => {
  it('sorts by artist ignoring articles, accents and case', () => {
    const list = [
      album({ title: 'doors', artist: 'The Doors' }),
      album({ title: 'abba', artist: 'abba' }),
      album({ title: 'alvarez', artist: 'Álvarez' }),
      album({ title: 'cerati', artist: 'Cerati' }),
    ];
    expect(titles(sortCollection(list, config([asc('artist')])))).toEqual(['abba', 'alvarez', 'cerati', 'doors']);
  });

  it('keeps articles when ignoreArticles is off', () => {
    const list = [album({ title: 'doors', artist: 'The Doors' }), album({ title: 'police', artist: 'Police' })];
    const cfg = config([asc('artist')]);
    cfg.options.ignoreArticles = false;
    expect(titles(sortCollection(list, cfg))).toEqual(['police', 'doors']);
  });

  it('uses natural numeric order and places numbers first or last', () => {
    const list = [
      album({ title: 'b', artist: 'Beck' }),
      album({ title: '10', artist: '10cc' }),
      album({ title: '2', artist: '2Pac' }),
    ];
    expect(titles(sortCollection(list, config([asc('artist')])))).toEqual(['2', '10', 'b']);
    const cfg = config([asc('artist')]);
    cfg.options.numbersFirst = false;
    expect(titles(sortCollection(list, cfg))).toEqual(['b', '2', '10']);
  });

  it('applies artist sort name overrides', () => {
    const list = [
      album({ title: 'charly', artist: 'Charly García', artistId: 'charly' }),
      album({ title: 'fito', artist: 'Fito Páez', artistId: 'fito' }),
    ];
    const sorted = sortCollection(list, config([asc('artist')]), { artistSortNames: { charly: 'García, Charly', fito: 'Páez, Fito' } });
    expect(titles(sorted)).toEqual(['charly', 'fito']);
    const reversed = sortCollection(list, config([asc('artist')]), { artistSortNames: { charly: 'Zzz' } });
    expect(titles(reversed)).toEqual(['fito', 'charly']);
  });

  it('chains rules: artist then release date', () => {
    const list = [
      album({ title: 'b-2001', artist: 'B', releaseDate: '2001-01-01' }),
      album({ title: 'a-1999', artist: 'A', releaseDate: '1999-05-01' }),
      album({ title: 'b-1990', artist: 'B', releaseDate: '1990-01-01' }),
      album({ title: 'a-1980', artist: 'A', releaseDate: '1980-03-01' }),
    ];
    expect(titles(sortCollection(list, config([asc('artist'), asc('releaseDate')])))).toEqual(['a-1980', 'a-1999', 'b-1990', 'b-2001']);
    expect(titles(sortCollection(list, config([asc('artist'), desc('releaseDate')])))).toEqual(['a-1999', 'a-1980', 'b-2001', 'b-1990']);
  });

  it('puts missing values last in both directions', () => {
    const list = [
      album({ title: 'none' }),
      album({ title: 'old', releaseDate: '1970' }),
      album({ title: 'new', releaseDate: '2020-01-01' }),
    ];
    expect(titles(sortCollection(list, config([asc('releaseDate')])))).toEqual(['old', 'new', 'none']);
    expect(titles(sortCollection(list, config([desc('releaseDate')])))).toEqual(['new', 'old', 'none']);
  });

  it('is stable for equal keys', () => {
    const list = ['1', '2', '3', '4', '5'].map((t) => album({ title: t, artist: 'Same' }));
    expect(titles(sortCollection(list, config([asc('artist')])))).toEqual(['1', '2', '3', '4', '5']);
    expect(titles(sortCollection(list, config([desc('artist')])))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('does not mutate the input', () => {
    const list = [album({ artist: 'B' }), album({ artist: 'A' })];
    const copy = [...list];
    sortCollection(list, config([asc('artist')]));
    expect(list).toEqual(copy);
  });

  it('moves various artists and compilations to the end', () => {
    const list = [
      album({ title: 'va', artist: 'Various Artists' }),
      album({ title: 'comp', artist: 'Abba', type: 'COMPILATION' }),
      album({ title: 'zappa', artist: 'Zappa' }),
      album({ title: 'beck', artist: 'Beck' }),
    ];
    expect(titles(sortCollection(list, config([asc('artist')])))).toEqual(['beck', 'zappa', 'comp', 'va']);
    const cfg = config([asc('artist')]);
    cfg.options.variousArtistsLast = false;
    expect(titles(sortCollection(list, cfg))).toEqual(['comp', 'beck', 'va', 'zappa']);
  });

  it('keeps various artists in date order when the chain is chronological', () => {
    const list = [
      album({ title: 'va-1960', artist: 'Various Artists', releaseDate: '1960-01-01' }),
      album({ title: 'abba-1975', artist: 'Abba', releaseDate: '1975-01-01' }),
    ];
    expect(titles(sortCollection(list, config([asc('releaseDate'), asc('artist')])))).toEqual(['va-1960', 'abba-1975']);
  });

  it('places EPs and singles after albums within each artist when singlesSeparate', () => {
    const list = [
      album({ title: 'a-ep-1990', artist: 'A', type: 'EP', releaseDate: '1990-01-01' }),
      album({ title: 'a-lp-2000', artist: 'A', releaseDate: '2000-01-01' }),
      album({ title: 'b-single-1980', artist: 'B', type: 'SINGLE', releaseDate: '1980-01-01' }),
      album({ title: 'b-lp-1985', artist: 'B', releaseDate: '1985-01-01' }),
    ];
    const cfg = config([asc('artist'), asc('releaseDate')]);
    expect(titles(sortCollection(list, cfg))).toEqual(['a-ep-1990', 'a-lp-2000', 'b-single-1980', 'b-lp-1985']);
    cfg.options.singlesSeparate = true;
    expect(titles(sortCollection(list, cfg))).toEqual(['a-lp-2000', 'a-ep-1990', 'b-lp-1985', 'b-single-1980']);
  });

  it('sorts by title ignoring articles', () => {
    const list = [album({ title: 'The Wall' }), album({ title: 'Animals' }), album({ title: 'El Amor Después del Amor' })];
    expect(titles(sortCollection(list, config([asc('title')])))).toEqual(['El Amor Después del Amor', 'Animals', 'The Wall']);
  });

  it('sorts by addedAt descending', () => {
    const list = [
      album({ title: 'first', addedAt: '2024-01-01T00:00:00Z' }),
      album({ title: 'last', addedAt: '2025-06-01T00:00:00Z' }),
      album({ title: 'mid', addedAt: '2024-12-01T00:00:00Z' }),
    ];
    expect(titles(sortCollection(list, config([desc('addedAt')])))).toEqual(['last', 'mid', 'first']);
  });

  it('sorts by label, genre, duration and track count', () => {
    const list = [
      album({ title: 'x', label: 'Sony', genres: ['Rock'], duration: 3000, numberOfTracks: 12 }),
      album({ title: 'y', label: 'EMI', genres: ['Jazz', 'Rock'], duration: 1200, numberOfTracks: 8 }),
      album({ title: 'z', label: '  ', genres: [], duration: undefined, numberOfTracks: 20 }),
    ];
    expect(titles(sortCollection(list, config([asc('label')])))).toEqual(['y', 'x', 'z']);
    expect(titles(sortCollection(list, config([asc('genre')])))).toEqual(['y', 'x', 'z']);
    expect(titles(sortCollection(list, config([asc('duration')])))).toEqual(['y', 'x', 'z']);
    expect(titles(sortCollection(list, config([desc('numberOfTracks')])))).toEqual(['z', 'x', 'y']);
  });

  it('sorts by type using the configurable order', () => {
    const list = [
      album({ title: 'comp', type: 'COMPILATION' }),
      album({ title: 'single', type: 'SINGLE' }),
      album({ title: 'lp', type: 'ALBUM' }),
      album({ title: 'ep', type: 'EP' }),
    ];
    expect(titles(sortCollection(list, config([asc('type')])))).toEqual(['lp', 'ep', 'single', 'comp']);
    const cfg = config([asc('type')]);
    cfg.options.typeOrder = ['SINGLE', 'EP', 'ALBUM', 'COMPILATION'];
    expect(titles(sortCollection(list, cfg))).toEqual(['single', 'ep', 'lp', 'comp']);
  });

  it('sorts by decade then the next rule', () => {
    const list = [
      album({ title: 'b-79', artist: 'B', releaseDate: '1979-01-01' }),
      album({ title: 'a-75', artist: 'A', releaseDate: '1975-01-01' }),
      album({ title: 'a-81', artist: 'A', releaseDate: '1981-01-01' }),
    ];
    expect(titles(sortCollection(list, config([asc('decade'), asc('artist')])))).toEqual(['a-75', 'b-79', 'a-81']);
  });

  it('sorts by manual position with unpositioned albums last', () => {
    const list = [album({ title: 'a' }), album({ title: 'b' }), album({ title: 'c' })];
    const manualOrder = { [list[2]!.id]: 0, [list[0]!.id]: 1 };
    expect(titles(sortCollection(list, config([asc('manual')]), { manualOrder }))).toEqual(['c', 'a', 'b']);
  });

  it('sorts by cover color in rainbow order with neutrals last by lightness', () => {
    const colors: Record<string, CoverColor> = {};
    const make = (title: string, color?: CoverColor) => {
      const a = album({ title });
      if (color) colors[a.id] = color;
      return a;
    };
    const list = [
      make('black', { hue: 0, saturation: 0, lightness: 0.05 }),
      make('blue', { hue: 230, saturation: 0.8, lightness: 0.5 }),
      make('none'),
      make('white', { hue: 40, saturation: 0.05, lightness: 0.95 }),
      make('deep-red', { hue: 355, saturation: 0.9, lightness: 0.4 }),
      make('green', { hue: 120, saturation: 0.6, lightness: 0.4 }),
      make('orange', { hue: 30, saturation: 0.9, lightness: 0.5 }),
      make('gray', { hue: 0, saturation: 0.05, lightness: 0.5 }),
    ];
    expect(titles(sortCollection(list, config([asc('coverColor')]), { coverColors: colors })))
      .toEqual(['deep-red', 'orange', 'green', 'blue', 'white', 'gray', 'black', 'none']);
  });
});

describe('colorBand / colorRank', () => {
  it('names hue bands and neutrals', () => {
    expect(colorBand({ hue: 2, saturation: 0.8, lightness: 0.5 })).toBe('red');
    expect(colorBand({ hue: 350, saturation: 0.8, lightness: 0.5 })).toBe('red');
    expect(colorBand({ hue: 50, saturation: 0.8, lightness: 0.5 })).toBe('yellow');
    expect(colorBand({ hue: 210, saturation: 0.8, lightness: 0.5 })).toBe('blue');
    expect(colorBand({ hue: 300, saturation: 0.8, lightness: 0.5 })).toBe('pink');
    expect(colorBand({ hue: 210, saturation: 0.05, lightness: 0.95 })).toBe('white');
    expect(colorBand({ hue: 210, saturation: 0.05, lightness: 0.5 })).toBe('gray');
    expect(colorBand({ hue: 210, saturation: 0.9, lightness: 0.05 })).toBe('black');
  });

  it('wraps reds around zero', () => {
    expect(colorRank({ hue: 350, saturation: 1, lightness: 0.5 })).toBeLessThan(colorRank({ hue: 5, saturation: 1, lightness: 0.5 }));
  });
});

describe('groupCollection', () => {
  it('groups by letter with # and a various artists shelf', () => {
    const cfg = createCollectionSortConfig('artist-chrono');
    const list = [
      album({ title: 'va', artist: 'Various Artists' }),
      album({ title: 'beatles', artist: 'The Beatles' }),
      album({ title: 'abba', artist: 'ABBA' }),
      album({ title: '2pac', artist: '2Pac' }),
      album({ title: 'alvarez', artist: 'Álvarez' }),
      album({ title: 'nandu', artist: 'Ñandú' }),
    ];
    const groups = groupCollection(sortCollection(list, cfg), cfg);
    expect(groups.map((g) => g.key)).toEqual(['#', 'A', 'B', 'Ñ', '__various__']);
    expect(groups.find((g) => g.key === 'A')!.items.map((a) => a.title)).toEqual(['abba', 'alvarez']);
    expect(groups.at(-1)!.labelKey).toBe('collectionSort.groups.various');
  });

  it('groups numbers after letters when numbersFirst is off', () => {
    const cfg = createCollectionSortConfig('artist-alpha', { numbersFirst: false });
    const list = [album({ artist: '10cc' }), album({ artist: 'Abba' })];
    expect(groupCollection(sortCollection(list, cfg), cfg).map((g) => g.key)).toEqual(['A', '#']);
  });

  it('uses title letters when the first rule is title', () => {
    const cfg = config([asc('title')], { groupBy: 'letter' });
    const list = [album({ title: 'Zeta', artist: 'Abba' }), album({ title: 'Alfa', artist: 'Zappa' })];
    expect(groupCollection(sortCollection(list, cfg), cfg).map((g) => g.key)).toEqual(['A', 'Z']);
  });

  it('groups by decade in chain direction with unknown last', () => {
    const cfg = createCollectionSortConfig('chronological');
    const list = [
      album({ title: '85', releaseDate: '1985-01-01' }),
      album({ title: '??' }),
      album({ title: '72', releaseDate: '1972-01-01' }),
      album({ title: '79', releaseDate: '1979-01-01' }),
    ];
    const groups = groupCollection(sortCollection(list, cfg), cfg);
    expect(groups.map((g) => g.label)).toEqual(['1970s', '1980s', '—']);
    expect(groups[0]!.items.map((a) => a.title)).toEqual(['72', '79']);
    expect(groups[2]!.labelKey).toBe('collectionSort.groups.unknown');

    const descCfg = config([desc('releaseDate')], { groupBy: 'decade' });
    expect(groupCollection(sortCollection(list, descCfg), descCfg).map((g) => g.label)).toEqual(['1980s', '1970s', '—']);
  });

  it('keeps groups contiguous even when the rules do not sort by the group', () => {
    const cfg = config([asc('artist')], { groupBy: 'decade' });
    const list = [
      album({ artist: 'A', releaseDate: '1990' }),
      album({ artist: 'B', releaseDate: '1970' }),
      album({ artist: 'C', releaseDate: '1990' }),
    ];
    const groups = groupCollection(sortCollection(list, cfg), cfg);
    expect(groups.map((g) => [g.key, g.items.map((a) => a.artists[0]!.name)])).toEqual([['1970', ['B']], ['1990', ['A', 'C']]]);
  });

  it('groups by label and genre case/accent-insensitively', () => {
    const cfg = config([asc('label')], { groupBy: 'label' });
    const list = [album({ label: 'Sony' }), album({ label: 'sony' }), album({ label: 'EMI' }), album({})];
    const groups = groupCollection(sortCollection(list, cfg), cfg);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([['EMI', 1], ['Sony', 2], ['—', 1]]);

    const genreCfg = config([asc('genre')], { groupBy: 'genre' });
    const genreGroups = groupCollection(sortCollection([album({ genres: ['Electrónica'] }), album({ genres: ['Electronica'] })], genreCfg), genreCfg);
    expect(genreGroups).toHaveLength(1);
  });

  it('groups by type with i18n keys in type order', () => {
    const cfg = config([asc('artist')], { groupBy: 'type' });
    const list = [album({ type: 'EP' }), album({ type: 'ALBUM' })];
    const groups = groupCollection(sortCollection(list, cfg), cfg);
    expect(groups.map((g) => g.labelKey)).toEqual(['album.types.ALBUM', 'album.types.EP']);
  });

  it('groups by artist, with singles after albums', () => {
    const cfg = config([asc('releaseDate')], { groupBy: 'artist' });
    cfg.options.singlesSeparate = true;
    const list = [
      album({ title: 'b1', artist: 'B', artistId: 'b', releaseDate: '2000' }),
      album({ title: 'a-ep', artist: 'A', artistId: 'a', type: 'EP', releaseDate: '1990' }),
      album({ title: 'a-lp', artist: 'A', artistId: 'a', releaseDate: '2000' }),
    ];
    const groups = groupCollection(sortCollection(list, cfg), cfg);
    expect(groups.map((g) => [g.key, g.label, g.items.map((a) => a.title)])).toEqual([
      ['a', 'A', ['a-lp', 'a-ep']],
      ['b', 'B', ['b1']],
    ]);
  });

  it('groups by color band in rainbow order', () => {
    const cfg = createCollectionSortConfig('color');
    const coverColors: Record<string, CoverColor> = {};
    const list = [
      album({ title: 'blue' }),
      album({ title: 'red' }),
      album({ title: 'nocolor' }),
      album({ title: 'black' }),
    ];
    coverColors[list[0]!.id] = { hue: 220, saturation: 0.7, lightness: 0.5 };
    coverColors[list[1]!.id] = { hue: 5, saturation: 0.7, lightness: 0.5 };
    coverColors[list[3]!.id] = { hue: 0, saturation: 0, lightness: 0.02 };
    const groups = groupCollection(sortCollection(list, cfg, { coverColors }), cfg, { coverColors });
    expect(groups.map((g) => g.key)).toEqual(['red', 'blue', 'black', '__unknown__']);
    expect(groups[0]!.labelKey).toBe('collectionSort.colors.red');
  });

  it('returns a single group when groupBy is none and nothing for empty input', () => {
    const cfg = config([asc('artist')]);
    expect(groupCollection(sortCollection([album(), album()], cfg), cfg)).toHaveLength(1);
    expect(groupCollection([], cfg)).toEqual([]);
  });
});

describe('presets and config', () => {
  it('exposes stable unique preset ids with i18n keys', () => {
    const ids = COLLECTION_SORT_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['artist-chrono', 'artist-alpha', 'chronological', 'genre-artist', 'label', 'decade-artist', 'acquisition', 'color', 'manual']);
    for (const p of COLLECTION_SORT_PRESETS) {
      expect(p.labelKey).toBe(`collectionSort.presets.${p.id}.label`);
      expect(p.descriptionKey).toBe(`collectionSort.presets.${p.id}.description`);
      expect(p.rules.length).toBeGreaterThan(0);
    }
  });

  it('defaults to artist-chrono with ignoreArticles and variousArtistsLast', () => {
    expect(DEFAULT_COLLECTION_SORT_CONFIG.preset).toBe('artist-chrono');
    expect(DEFAULT_COLLECTION_SORT_CONFIG.rules.map((r) => r.key)).toEqual(['artist', 'releaseDate', 'title']);
    expect(DEFAULT_COLLECTION_SORT_CONFIG.options.ignoreArticles).toBe(true);
    expect(DEFAULT_COLLECTION_SORT_CONFIG.options.variousArtistsLast).toBe(true);
  });

  it('applies a preset while keeping options', () => {
    const cfg = createCollectionSortConfig('artist-chrono', { singlesSeparate: true });
    const next = applyCollectionSortPreset(cfg, 'label');
    expect(next.preset).toBe('label');
    expect(next.groupBy).toBe('label');
    expect(next.options.singlesSeparate).toBe(true);
    expect(next.rules).not.toBe(COLLECTION_SORT_PRESETS.find((p) => p.id === 'label')!.rules);
  });

  it('matches presets from rules and groupBy', () => {
    expect(matchCollectionSortPreset([asc('addedAt')], 'none')).toBe('acquisition');
    expect(matchCollectionSortPreset([desc('addedAt')], 'none')).toBeNull();
  });

  it('normalizes untrusted stored config', () => {
    expect(normalizeCollectionSortConfig(null)).toEqual(DEFAULT_COLLECTION_SORT_CONFIG);
    const cfg = normalizeCollectionSortConfig({
      rules: [{ key: 'label' }, { key: 'bogus' }, { key: 'label', desc: true }, { key: 'releaseDate', desc: true }],
      groupBy: 'nope',
      options: { ignoreArticles: false, numbersFirst: 'yes', typeOrder: ['EP', 'EP', 'FOO'] },
    });
    expect(cfg.rules).toEqual([asc('label'), desc('releaseDate')]);
    expect(cfg.groupBy).toBe(DEFAULT_COLLECTION_SORT_CONFIG.groupBy);
    expect(cfg.options.ignoreArticles).toBe(false);
    expect(cfg.options.numbersFirst).toBe(true);
    expect(cfg.options.typeOrder).toEqual(['EP', 'ALBUM', 'SINGLE', 'COMPILATION']);
    expect(cfg.preset).toBeNull();
    expect(normalizeCollectionSortConfig(createCollectionSortConfig('color')).preset).toBe('color');
  });

  it('sorts the default preset like a record store', () => {
    const cfg = DEFAULT_COLLECTION_SORT_CONFIG;
    const list = [
      album({ title: 'Clics Modernos', artist: 'Charly García', artistId: 'charly', releaseDate: '1983-11-01' }),
      album({ title: 'Abbey Road', artist: 'The Beatles', releaseDate: '1969-09-26' }),
      album({ title: 'Yendo de la cama al living', artist: 'Charly García', artistId: 'charly', releaseDate: '1982-01-01' }),
      album({ title: 'Rock Nacional', artist: 'Varios artistas', releaseDate: '1975-01-01' }),
      album({ title: 'Please Please Me', artist: 'The Beatles', releaseDate: '1963-03-22' }),
    ];
    const ctx = { artistSortNames: { charly: 'García, Charly' } };
    expect(titles(sortCollection(list, cfg, ctx))).toEqual([
      'Please Please Me',
      'Abbey Road',
      'Yendo de la cama al living',
      'Clics Modernos',
      'Rock Nacional',
    ]);
    expect(groupCollection(sortCollection(list, cfg, ctx), cfg, ctx).map((g) => g.key)).toEqual(['B', 'G', '__various__']);
  });
});
