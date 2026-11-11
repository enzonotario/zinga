import type { NormalizedAlbum } from '~/providers/types';

export type AlbumType = NonNullable<NormalizedAlbum['type']>;

export type SortKey
  = | 'artist'
    | 'title'
    | 'releaseDate'
    | 'addedAt'
    | 'label'
    | 'genre'
    | 'type'
    | 'decade'
    | 'coverColor'
    | 'duration'
    | 'numberOfTracks'
    | 'manual';

export type GroupBy = 'none' | 'letter' | 'artist' | 'decade' | 'genre' | 'label' | 'type' | 'color';

export type ColorBand = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink' | 'white' | 'gray' | 'black';

export type CollectionSortPresetId
  = | 'artist-chrono'
    | 'artist-alpha'
    | 'chronological'
    | 'genre-artist'
    | 'label'
    | 'decade-artist'
    | 'acquisition'
    | 'color'
    | 'manual';

export interface SortRule {
  key: SortKey
  desc: boolean
}

export interface CollectionSortOptions {
  ignoreArticles: boolean
  numbersFirst: boolean
  variousArtistsLast: boolean
  singlesSeparate: boolean
  typeOrder: AlbumType[]
}

export interface CollectionSortConfig {
  preset: CollectionSortPresetId | null
  rules: SortRule[]
  groupBy: GroupBy
  options: CollectionSortOptions
}

export interface CoverColor {
  hue: number
  saturation: number
  lightness: number
}

export interface CollectionSortContext {
  coverColors?: Record<string, CoverColor>
  manualOrder?: Record<string, number>
  artistSortNames?: Record<string, string>
}

export interface CollectionGroup {
  key: string
  label: string
  labelKey?: string
  items: NormalizedAlbum[]
}

export interface CollectionSortPreset {
  id: CollectionSortPresetId
  labelKey: string
  descriptionKey: string
  icon: string
  rules: SortRule[]
  groupBy: GroupBy
}

export const SORT_KEYS: SortKey[] = [
  'artist',
  'title',
  'releaseDate',
  'addedAt',
  'label',
  'genre',
  'type',
  'decade',
  'coverColor',
  'duration',
  'numberOfTracks',
  'manual',
];

export const GROUP_BY_VALUES: GroupBy[] = ['none', 'letter', 'artist', 'decade', 'genre', 'label', 'type', 'color'];

export const COLOR_BANDS: ColorBand[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'white', 'gray', 'black'];

export const DEFAULT_TYPE_ORDER: AlbumType[] = ['ALBUM', 'EP', 'SINGLE', 'COMPILATION'];

export const DEFAULT_COLLECTION_SORT_OPTIONS: CollectionSortOptions = {
  ignoreArticles: true,
  numbersFirst: true,
  variousArtistsLast: true,
  singlesSeparate: false,
  typeOrder: DEFAULT_TYPE_ORDER,
};

function rule(key: SortKey, desc = false): SortRule {
  return { key, desc };
}

function preset(id: CollectionSortPresetId, icon: string, rules: SortRule[], groupBy: GroupBy): CollectionSortPreset {
  return {
    id,
    labelKey: `collectionSort.presets.${id}.label`,
    descriptionKey: `collectionSort.presets.${id}.description`,
    icon,
    rules,
    groupBy,
  };
}

export const COLLECTION_SORT_PRESETS: CollectionSortPreset[] = [
  preset('artist-chrono', 'i-heroicons-user-group', [rule('artist'), rule('releaseDate'), rule('title')], 'letter'),
  preset('artist-alpha', 'i-heroicons-bars-arrow-down', [rule('artist'), rule('title')], 'letter'),
  preset('chronological', 'i-heroicons-clock', [rule('releaseDate'), rule('artist'), rule('title')], 'decade'),
  preset('genre-artist', 'i-heroicons-tag', [rule('genre'), rule('artist'), rule('releaseDate')], 'genre'),
  preset('label', 'i-heroicons-building-storefront', [rule('label'), rule('releaseDate'), rule('artist')], 'label'),
  preset('decade-artist', 'i-heroicons-calendar', [rule('decade'), rule('artist'), rule('releaseDate')], 'decade'),
  preset('acquisition', 'i-heroicons-shopping-bag', [rule('addedAt')], 'none'),
  preset('color', 'i-heroicons-swatch', [rule('coverColor'), rule('artist')], 'color'),
  preset('manual', 'i-heroicons-hand-raised', [rule('manual'), rule('addedAt', true)], 'none'),
];

export const DEFAULT_COLLECTION_SORT_PRESET: CollectionSortPresetId = 'artist-chrono';

export function getCollectionSortPreset(id: CollectionSortPresetId): CollectionSortPreset | undefined {
  return COLLECTION_SORT_PRESETS.find((p) => p.id === id);
}

export function createCollectionSortConfig(
  presetId: CollectionSortPresetId = DEFAULT_COLLECTION_SORT_PRESET,
  options: Partial<CollectionSortOptions> = {},
): CollectionSortConfig {
  const found = getCollectionSortPreset(presetId) ?? COLLECTION_SORT_PRESETS[0]!;
  return {
    preset: found.id,
    rules: found.rules.map((r) => ({ ...r })),
    groupBy: found.groupBy,
    options: { ...DEFAULT_COLLECTION_SORT_OPTIONS, ...options, typeOrder: [...(options.typeOrder ?? DEFAULT_TYPE_ORDER)] },
  };
}

export const DEFAULT_COLLECTION_SORT_CONFIG: CollectionSortConfig = createCollectionSortConfig();

export function applyCollectionSortPreset(config: CollectionSortConfig, presetId: CollectionSortPresetId): CollectionSortConfig {
  const found = getCollectionSortPreset(presetId);
  if (!found) return config;
  return {
    ...config,
    preset: found.id,
    rules: found.rules.map((r) => ({ ...r })),
    groupBy: found.groupBy,
  };
}

function sameRules(a: SortRule[], b: SortRule[]): boolean {
  return a.length === b.length && a.every((r, i) => r.key === b[i]!.key && r.desc === b[i]!.desc);
}

export function matchCollectionSortPreset(rules: SortRule[], groupBy: GroupBy): CollectionSortPresetId | null {
  return COLLECTION_SORT_PRESETS.find((p) => p.groupBy === groupBy && sameRules(p.rules, rules))?.id ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRules(raw: unknown): SortRule[] | null {
  if (!Array.isArray(raw)) return null;
  const rules: SortRule[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !SORT_KEYS.includes(item.key as SortKey)) continue;
    if (rules.some((r) => r.key === item.key)) continue;
    rules.push({ key: item.key as SortKey, desc: item.desc === true });
  }
  return rules.length > 0 ? rules : null;
}

function normalizeTypeOrder(raw: unknown): AlbumType[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TYPE_ORDER];
  const order = raw.filter((t, i): t is AlbumType => DEFAULT_TYPE_ORDER.includes(t as AlbumType) && raw.indexOf(t) === i);
  return [...order, ...DEFAULT_TYPE_ORDER.filter((t) => !order.includes(t))];
}

export function normalizeCollectionSortConfig(raw: unknown): CollectionSortConfig {
  const fallback = createCollectionSortConfig();
  if (!isRecord(raw)) return fallback;

  const rules = normalizeRules(raw.rules) ?? fallback.rules;
  const groupBy = GROUP_BY_VALUES.includes(raw.groupBy as GroupBy) ? raw.groupBy as GroupBy : fallback.groupBy;
  const rawOptions = isRecord(raw.options) ? raw.options : {};
  const bool = (key: keyof Omit<CollectionSortOptions, 'typeOrder'>) =>
    typeof rawOptions[key] === 'boolean' ? rawOptions[key] as boolean : DEFAULT_COLLECTION_SORT_OPTIONS[key];

  return {
    preset: matchCollectionSortPreset(rules, groupBy),
    rules,
    groupBy,
    options: {
      ignoreArticles: bool('ignoreArticles'),
      numbersFirst: bool('numbersFirst'),
      variousArtistsLast: bool('variousArtistsLast'),
      singlesSeparate: bool('singlesSeparate'),
      typeOrder: normalizeTypeOrder(rawOptions.typeOrder),
    },
  };
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

const ARTICLE_PATTERN = /^(?:the|los|las|la|el|les|die|a)\s+(?=\S)/i;
const VARIOUS_ARTISTS_PATTERN = /^(?:various(?: artists)?|varios(?: artistas)?|v\.?\s?a\.?|artistas varios)$/i;

export function stripArticle(value: string): string {
  return value.trim().replace(ARTICLE_PATTERN, '');
}

export function isVariousArtists(album: NormalizedAlbum): boolean {
  if (album.type === 'COMPILATION') return true;
  if (album.artists.length === 0) return true;
  return album.artists.some((a) => VARIOUS_ARTISTS_PATTERN.test(a.name.trim()));
}

function startsWithLetter(value: string): boolean {
  return /^\p{L}/u.test(value);
}

export function sortLetter(value: string): string {
  const first = value.trim().charAt(0);
  if (!first || !startsWithLetter(first)) return '#';
  const upper = first.toLocaleUpperCase('es');
  if (upper === 'Ñ') return 'Ñ';
  const base = upper.normalize('NFD').replace(/\p{M}/gu, '');
  return /^[A-Z]$/.test(base) ? base : '#';
}

export function artistSortName(album: NormalizedAlbum, options: CollectionSortOptions, ctx: CollectionSortContext = {}): string {
  const artist = album.artists[0];
  if (!artist) return '';
  const override = ctx.artistSortNames?.[artist.id]?.trim();
  if (override) return override;
  return options.ignoreArticles ? stripArticle(artist.name) : artist.name.trim();
}

function titleSortName(album: NormalizedAlbum, options: CollectionSortOptions): string {
  return options.ignoreArticles ? stripArticle(album.title) : album.title.trim();
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function releaseYear(album: NormalizedAlbum): number | null {
  const match = album.releaseDate?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function releaseDecade(album: NormalizedAlbum): number | null {
  const year = releaseYear(album);
  return year === null ? null : Math.floor(year / 10) * 10;
}

const NEUTRAL_SATURATION = 0.15;
const DARK_LIGHTNESS = 0.12;
const LIGHT_LIGHTNESS = 0.9;

export function isNeutralColor(color: CoverColor): boolean {
  return color.saturation < NEUTRAL_SATURATION || color.lightness < DARK_LIGHTNESS || color.lightness > LIGHT_LIGHTNESS;
}

export function colorBand(color: CoverColor): ColorBand {
  if (isNeutralColor(color)) {
    if (color.lightness >= 0.7) return 'white';
    if (color.lightness <= 0.3) return 'black';
    return 'gray';
  }
  const hue = ((color.hue % 360) + 360) % 360;
  if (hue >= 345 || hue < 15) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 200) return 'cyan';
  if (hue < 260) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

export function colorRank(color: CoverColor): number {
  if (isNeutralColor(color)) return 1000 + (1 - color.lightness);
  const hue = ((color.hue % 360) + 360) % 360;
  return hue >= 345 ? hue - 360 : hue;
}

type SortValue = string | number | readonly [number, string] | null;

interface Entry {
  album: NormalizedAlbum
  index: number
  values: Map<string, SortValue>
}

function rawCompare(a: NonNullable<SortValue>, b: NonNullable<SortValue>): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (Array.isArray(a) && Array.isArray(b)) return a[0] - b[0] || collator.compare(a[1], b[1]);
  return collator.compare(String(a), String(b));
}

function compareValues(a: SortValue, b: SortValue, desc: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = rawCompare(a, b);
  return desc ? -result : result;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function letterRank(value: string, options: CollectionSortOptions): number {
  if (startsWithLetter(value)) return options.numbersFirst ? 1 : 0;
  return options.numbersFirst ? 0 : 1;
}

function alphaKey(value: string, options: CollectionSortOptions): readonly [number, string] | null {
  if (!value) return null;
  return [letterRank(value, options), value];
}

function typeIndex(album: NormalizedAlbum, options: CollectionSortOptions): number | null {
  if (!album.type) return null;
  const index = options.typeOrder.indexOf(album.type);
  return index === -1 ? options.typeOrder.length : index;
}

function sortValue(key: SortKey, album: NormalizedAlbum, options: CollectionSortOptions, ctx: CollectionSortContext): SortValue {
  switch (key) {
    case 'artist':
      return alphaKey(artistSortName(album, options, ctx), options);
    case 'title':
      return alphaKey(titleSortName(album, options), options);
    case 'releaseDate':
      return parseDate(album.releaseDate);
    case 'addedAt':
      return parseDate(album.addedAt);
    case 'label':
      return nonEmpty(album.label);
    case 'genre':
      return nonEmpty(album.genres?.[0]);
    case 'type':
      return typeIndex(album, options);
    case 'decade':
      return releaseDecade(album);
    case 'coverColor': {
      const color = ctx.coverColors?.[album.id];
      return color ? colorRank(color) : null;
    }
    case 'duration':
      return album.duration ?? null;
    case 'numberOfTracks':
      return album.numberOfTracks ?? null;
    case 'manual':
      return ctx.manualOrder?.[album.id] ?? null;
  }
}

function groupSortKey(config: CollectionSortConfig): SortKey | null {
  switch (config.groupBy) {
    case 'none':
      return null;
    case 'letter':
      return config.rules[0]?.key === 'title' ? 'title' : 'artist';
    case 'artist':
      return 'artist';
    case 'decade':
      return 'decade';
    case 'genre':
      return 'genre';
    case 'label':
      return 'label';
    case 'type':
      return 'type';
    case 'color':
      return 'coverColor';
  }
}

function groupValue(config: CollectionSortConfig, album: NormalizedAlbum, ctx: CollectionSortContext): SortValue {
  const { options } = config;
  switch (config.groupBy) {
    case 'letter': {
      const name = groupSortKey(config) === 'title' ? titleSortName(album, options) : artistSortName(album, options, ctx);
      if (!name) return null;
      return alphaKey(sortLetter(name), options);
    }
    case 'color': {
      const color = ctx.coverColors?.[album.id];
      return color ? COLOR_BANDS.indexOf(colorBand(color)) : null;
    }
    case 'decade':
      return releaseDecade(album);
    default: {
      const key = groupSortKey(config);
      return key ? sortValue(key, album, options, ctx) : null;
    }
  }
}

function groupDirection(config: CollectionSortConfig): boolean {
  const groupKey = groupSortKey(config);
  const first = config.rules[0];
  if (!first || !groupKey) return false;
  const related = first.key === groupKey || (groupKey === 'decade' && first.key === 'releaseDate');
  return related && first.desc;
}

interface Step {
  id: string
  desc: boolean
}

function buildSteps(config: CollectionSortConfig): Step[] {
  const { options } = config;
  const steps: Step[] = [];
  const push = (id: string, desc = false) => {
    if (!steps.some((s) => s.id === id)) steps.push({ id, desc });
  };
  const groupKey = groupSortKey(config);

  if (groupKey === 'artist' && options.variousArtistsLast) push('various');
  if (groupKey) push('group', groupDirection(config));
  if (config.groupBy === 'artist' && options.singlesSeparate) push('singles');

  for (const r of config.rules) {
    if (r.key === 'artist' && options.variousArtistsLast) push('various');
    push(r.key, r.desc);
    if (r.key === 'artist' && options.singlesSeparate) push('singles');
  }
  return steps;
}

function stepValue(id: string, config: CollectionSortConfig, album: NormalizedAlbum, ctx: CollectionSortContext): SortValue {
  if (id === 'various') return isVariousArtists(album) ? 1 : 0;
  if (id === 'singles') return album.type === 'EP' || album.type === 'SINGLE' ? 1 : 0;
  if (id === 'group') return groupValue(config, album, ctx);
  return sortValue(id as SortKey, album, config.options, ctx);
}

export function sortCollection(
  albums: readonly NormalizedAlbum[],
  config: CollectionSortConfig,
  ctx: CollectionSortContext = {},
): NormalizedAlbum[] {
  const steps = buildSteps(config);
  const entries: Entry[] = albums.map((album, index) => ({
    album,
    index,
    values: new Map(steps.map((s) => [s.id, stepValue(s.id, config, album, ctx)])),
  }));

  entries.sort((a, b) => {
    for (const step of steps) {
      const result = compareValues(a.values.get(step.id) ?? null, b.values.get(step.id) ?? null, step.desc);
      if (result !== 0) return result;
    }
    return a.index - b.index;
  });

  return entries.map((e) => e.album);
}

const UNKNOWN_GROUP = '__unknown__';
const VARIOUS_GROUP = '__various__';

interface GroupIdentity {
  key: string
  label: string
  labelKey?: string
}

function unknownGroup(): GroupIdentity {
  return { key: UNKNOWN_GROUP, label: '—', labelKey: 'collectionSort.groups.unknown' };
}

function variousGroup(): GroupIdentity {
  return { key: VARIOUS_GROUP, label: 'Various Artists', labelKey: 'collectionSort.groups.various' };
}

function textGroup(value: string | undefined): GroupIdentity {
  const text = nonEmpty(value);
  if (!text) return unknownGroup();
  return { key: text.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, ''), label: text };
}

function groupIdentity(album: NormalizedAlbum, config: CollectionSortConfig, ctx: CollectionSortContext): GroupIdentity {
  const { options } = config;
  const variousSeparate = options.variousArtistsLast && isVariousArtists(album);

  switch (config.groupBy) {
    case 'letter': {
      if (groupSortKey(config) === 'title') {
        const title = titleSortName(album, options);
        if (!title) return unknownGroup();
        const letter = sortLetter(title);
        return { key: letter, label: letter };
      }
      if (variousSeparate) return variousGroup();
      const name = artistSortName(album, options, ctx);
      if (!name) return unknownGroup();
      const letter = sortLetter(name);
      return { key: letter, label: letter };
    }
    case 'artist': {
      if (variousSeparate) return variousGroup();
      const artist = album.artists[0];
      if (!artist) return unknownGroup();
      return { key: artist.id || artist.name, label: artist.name };
    }
    case 'decade': {
      const decade = releaseDecade(album);
      return decade === null ? unknownGroup() : { key: String(decade), label: `${decade}s` };
    }
    case 'genre':
      return textGroup(album.genres?.[0]);
    case 'label':
      return textGroup(album.label);
    case 'type':
      return album.type
        ? { key: album.type, label: album.type, labelKey: `album.types.${album.type}` }
        : unknownGroup();
    case 'color': {
      const color = ctx.coverColors?.[album.id];
      if (!color) return unknownGroup();
      const band = colorBand(color);
      return { key: band, label: band, labelKey: `collectionSort.colors.${band}` };
    }
    case 'none':
      return { key: 'all', label: '' };
  }
}

export function groupCollection(
  sorted: readonly NormalizedAlbum[],
  config: CollectionSortConfig,
  ctx: CollectionSortContext = {},
): CollectionGroup[] {
  if (sorted.length === 0) return [];
  const groups = new Map<string, CollectionGroup>();
  for (const album of sorted) {
    const identity = groupIdentity(album, config, ctx);
    const group = groups.get(identity.key);
    if (group) {
      group.items.push(album);
      continue;
    }
    groups.set(identity.key, { ...identity, items: [album] });
  }
  return [...groups.values()];
}

export function collectionSortNeedsCoverColors(config: CollectionSortConfig): boolean {
  return config.groupBy === 'color' || config.rules.some((r) => r.key === 'coverColor');
}

export function collectionSortNeedsManualOrder(config: CollectionSortConfig): boolean {
  return config.rules.some((r) => r.key === 'manual');
}
