import { describe, expect, it } from 'vitest';
import {
  applySelectionClick,
  orderedSelectedItems,
  rangeSelection,
  toggleSelection,
} from './selection';

describe('selection utils', () => {
  it('should toggle ids without mutating the source list', () => {
    const base = ['a', 'b'];
    expect(toggleSelection(base, 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleSelection(base, 'a')).toEqual(['b']);
    expect(base).toEqual(['a', 'b']);
  });

  it('should select inclusive ranges regardless of direction', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(rangeSelection(ids, 1, 3)).toEqual(['b', 'c', 'd']);
    expect(rangeSelection(ids, 3, 1)).toEqual(['b', 'c', 'd']);
    expect(rangeSelection(ids, 0, 0)).toEqual(['a']);
    expect(rangeSelection([], 0, 2)).toEqual([]);
  });

  it('should play and clear on plain click', () => {
    const result = applySelectionClick({
      selected: ['a'],
      sectionId: 'songs',
      anchorIndex: 0,
      nextSectionId: 'songs',
      orderedIds: ['a', 'b'],
      index: 1,
      ctrlOrMeta: false,
      shift: false,
    });
    expect(result).toEqual({
      kind: 'play',
      selected: [],
      sectionId: null,
      anchorIndex: null,
    });
  });

  it('should toggle with ctrl and range with shift inside one section', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const toggled = applySelectionClick({
      selected: [],
      sectionId: null,
      anchorIndex: null,
      nextSectionId: 'videos',
      orderedIds: ids,
      index: 1,
      ctrlOrMeta: true,
      shift: false,
    });
    expect(toggled.kind).toBe('select');
    expect(toggled.selected).toEqual(['b']);
    expect(toggled.anchorIndex).toBe(1);

    const ranged = applySelectionClick({
      selected: toggled.selected,
      sectionId: toggled.sectionId,
      anchorIndex: toggled.anchorIndex,
      nextSectionId: 'videos',
      orderedIds: ids,
      index: 3,
      ctrlOrMeta: false,
      shift: true,
    });
    expect(ranged.selected).toEqual(['b', 'c', 'd']);
    expect(ranged.sectionId).toBe('videos');
  });

  it('should reset when starting a selection in another section', () => {
    const result = applySelectionClick({
      selected: ['a'],
      sectionId: 'songs',
      anchorIndex: 0,
      nextSectionId: 'videos',
      orderedIds: ['x', 'y'],
      index: 0,
      ctrlOrMeta: true,
      shift: false,
    });
    expect(result.selected).toEqual(['x']);
    expect(result.sectionId).toBe('videos');
  });

  it('should keep on-screen order when resolving selected items', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(orderedSelectedItems(items, ['c', 'a'], (item) => item.id)).toEqual([
      { id: 'a' },
      { id: 'c' },
    ]);
  });
});
