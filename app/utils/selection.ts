export function toggleSelection(selected: string[], id: string): string[] {
  const index = selected.indexOf(id);
  if (index >= 0) {
    return selected.filter((_, i) => i !== index);
  }
  return [...selected, id];
}

export function rangeSelection(orderedIds: string[], fromIndex: number, toIndex: number): string[] {
  if (!orderedIds.length) return [];
  const start = Math.max(0, Math.min(fromIndex, toIndex, orderedIds.length - 1));
  const end = Math.min(orderedIds.length - 1, Math.max(fromIndex, toIndex, 0));
  return orderedIds.slice(start, end + 1);
}

export type SelectionClickKind = 'play' | 'select';

export interface SelectionClickResult {
  kind: SelectionClickKind
  selected: string[]
  sectionId: string | null
  anchorIndex: number | null
}

export function applySelectionClick(options: {
  selected: string[]
  sectionId: string | null
  anchorIndex: number | null
  nextSectionId: string
  orderedIds: string[]
  index: number
  ctrlOrMeta: boolean
  shift: boolean
}): SelectionClickResult {
  const { orderedIds, index } = options;
  const id = orderedIds[index];
  if (!id) {
    return {
      kind: 'play',
      selected: [],
      sectionId: null,
      anchorIndex: null,
    };
  }

  if (!options.ctrlOrMeta && !options.shift) {
    return {
      kind: 'play',
      selected: [],
      sectionId: null,
      anchorIndex: null,
    };
  }

  let selected = options.selected;
  let sectionId = options.sectionId;
  let anchorIndex = options.anchorIndex;

  if (sectionId !== options.nextSectionId) {
    selected = [];
    sectionId = options.nextSectionId;
    anchorIndex = null;
  }

  if (options.shift && anchorIndex != null) {
    selected = rangeSelection(orderedIds, anchorIndex, index);
  } else if (options.ctrlOrMeta) {
    selected = toggleSelection(selected, id);
    anchorIndex = index;
  } else {
    selected = [id];
    anchorIndex = index;
  }

  if (!selected.length) {
    return {
      kind: 'select',
      selected: [],
      sectionId: null,
      anchorIndex: null,
    };
  }

  return {
    kind: 'select',
    selected,
    sectionId: options.nextSectionId,
    anchorIndex,
  };
}

export function orderedSelectedItems<T>(
  items: T[],
  selectedIds: string[],
  getId: (item: T) => string,
): T[] {
  if (!selectedIds.length) return [];
  const selected = new Set(selectedIds);
  return items.filter((item) => selected.has(getId(item)));
}
