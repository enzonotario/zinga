export function useImageFullscreen() {
  const isOpen = ref(false);
  const imageUrl = ref('');
  const imageAlt = ref('');
  const imageTitle = ref('');
  const scale = ref(1);
  const translateX = ref(0);
  const translateY = ref(0);
  const isDragging = ref(false);
  const dragStart = ref({ x: 0, y: 0 });
  const lastTranslate = ref({ x: 0, y: 0 });
  const MIN_SCALE = 1;
  const MAX_SCALE = 5;
  const imageTransform = computed(() => {
    return `scale(${scale.value}) translate(${translateX.value}px, ${translateY.value}px)`;
  });
  function resetZoom() {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }
  function open(url: string, alt?: string, title?: string) {
    if (!url) return;
    imageUrl.value = url;
    imageAlt.value = alt || '';
    imageTitle.value = title || '';
    resetZoom();
    isOpen.value = true;
  }
  function close() {
    isOpen.value = false;
    resetZoom();
  }
  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value + delta));
    if (newScale === 1) {
      resetZoom();
    } else {
      scale.value = newScale;
    }
  }
  function handleMouseDown(e: MouseEvent) {
    if (scale.value > 1) {
      isDragging.value = true;
      dragStart.value = { x: e.clientX, y: e.clientY };
      lastTranslate.value = { x: translateX.value, y: translateY.value };
      e.preventDefault();
    }
  }
  function handleMouseMove(e: MouseEvent) {
    if (!isDragging.value || scale.value <= 1) return;
    const deltaX = (e.clientX - dragStart.value.x) / scale.value;
    const deltaY = (e.clientY - dragStart.value.y) / scale.value;
    translateX.value = lastTranslate.value.x + deltaX;
    translateY.value = lastTranslate.value.y + deltaY;
  }
  function handleMouseUp() {
    isDragging.value = false;
  }
  function handleDoubleClick() {
    if (scale.value > 1) {
      resetZoom();
    } else {
      scale.value = 2.5;
    }
  }
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen.value) {
      close();
    }
  }
  watch(isOpen, (open) => {
    if (open) {
      window.addEventListener('keydown', handleKeydown);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
    } else {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    }
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('mousemove', handleMouseMove);
  });
  return {
    isOpen: readonly(isOpen),
    imageUrl: readonly(imageUrl),
    imageAlt: readonly(imageAlt),
    imageTitle: readonly(imageTitle),
    scale: readonly(scale),
    isDragging: readonly(isDragging),
    imageTransform,
    open,
    close,
    resetZoom,
    handleWheel,
    handleMouseDown,
    handleDoubleClick,
  };
}
const globalFullscreen = useImageFullscreen();
export function useGlobalImageFullscreen() {
  return globalFullscreen;
}
