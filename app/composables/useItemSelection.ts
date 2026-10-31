import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { applySelectionClick } from '~/utils/selection';

export default function useItemSelection() {
  const route = useRoute();
  const selectedIds = ref<string[]>([]);
  const sectionId = ref<string | null>(null);
  const anchorIndex = ref<number | null>(null);

  const count = computed(() => selectedIds.value.length);
  const hasSelection = computed(() => count.value > 0);

  function clear() {
    selectedIds.value = [];
    sectionId.value = null;
    anchorIndex.value = null;
  }

  function isSelected(section: string, id: string) {
    return sectionId.value === section && selectedIds.value.includes(id);
  }

  function handleClick(
    event: MouseEvent,
    nextSectionId: string,
    orderedIds: string[],
    index: number,
  ) {
    const result = applySelectionClick({
      selected: selectedIds.value,
      sectionId: sectionId.value,
      anchorIndex: anchorIndex.value,
      nextSectionId,
      orderedIds,
      index,
      ctrlOrMeta: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
    });
    selectedIds.value = result.selected;
    sectionId.value = result.sectionId;
    anchorIndex.value = result.anchorIndex;
    if (result.kind === 'select') {
      event.preventDefault();
    }
    return result.kind;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && hasSelection.value) {
      event.preventDefault();
      clear();
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown);
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
  });

  watch(
    () => route.fullPath,
    () => clear(),
  );

  return {
    selectedIds,
    sectionId,
    anchorIndex,
    count,
    hasSelection,
    clear,
    isSelected,
    handleClick,
  };
}
