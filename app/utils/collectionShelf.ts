import type { CollectionGroup, ColorBand } from '~/utils/collectionSort';

export type DropPlacement = 'before' | 'after';

export interface QuickJumpLetter {
  letter: string
  groupKey: string | null
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SORT_NAME_PREFIXES = /^(?:the|los|las|la|el|les|die)\s+/i;

export const COLOR_BAND_SWATCHES: Record<ColorBand, string> = {
  red: 'hsl(0 75% 52%)',
  orange: 'hsl(28 90% 55%)',
  yellow: 'hsl(52 90% 55%)',
  green: 'hsl(130 50% 42%)',
  cyan: 'hsl(185 65% 45%)',
  blue: 'hsl(220 70% 50%)',
  purple: 'hsl(272 55% 52%)',
  pink: 'hsl(320 65% 60%)',
  white: 'hsl(0 0% 94%)',
  gray: 'hsl(0 0% 55%)',
  black: 'hsl(0 0% 10%)',
};

export function suggestArtistSortName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.includes(',')) return trimmed;

  const article = trimmed.match(SORT_NAME_PREFIXES);
  if (article) {
    const rest = trimmed.slice(article[0].length);
    return rest ? `${rest}, ${article[0].trim()}` : trimmed;
  }

  const words = trimmed.split(' ');
  if (words.length < 2) return trimmed;
  const last = words.pop()!;
  return `${last}, ${words.join(' ')}`;
}

export function quickJumpLetters(groups: readonly Pick<CollectionGroup, 'key'>[], numbersFirst = true): QuickJumpLetter[] {
  const keys = new Set(groups.map((g) => g.key));
  const letters = [...ALPHABET];
  if (keys.has('Ñ')) letters.splice(letters.indexOf('N') + 1, 0, 'Ñ');
  if (numbersFirst) letters.unshift('#');
  else letters.push('#');
  return letters.map((letter) => ({ letter, groupKey: keys.has(letter) ? letter : null }));
}

export function reorderIds(ids: readonly string[], draggedId: string, targetId: string, placement: DropPlacement): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return [...ids];
  const rest = ids.filter((id) => id !== draggedId);
  const targetIndex = rest.indexOf(targetId);
  rest.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, draggedId);
  return rest;
}

export function applySubsetOrder(fullIds: readonly string[], subsetOrder: readonly string[]): string[] {
  const subset = new Set(subsetOrder);
  const queue = subsetOrder.filter((id) => fullIds.includes(id));
  let next = 0;
  return fullIds.map((id) => (subset.has(id) ? queue[next++]! : id));
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function tidalCoverAtSize(url: string | undefined, size: number): string | undefined {
  if (!url) return url;
  return url.replace(/^(https?:\/\/resources\.tidal\.com\/images\/.+\/)\d+x\d+\.jpg$/i, `$1${size}x${size}.jpg`);
}
