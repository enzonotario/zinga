<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue';
import { parseLrc } from '~/utils/lrc';

interface Props {
  lrc: string
  currentTimeSec: number
  bodyStyle?: Record<string, string>
}
const props = defineProps<Props>();

const lines = computed(() => parseLrc(props.lrc));
const lineRefs = ref<(HTMLElement | null)[]>([]);
const rootRef = ref<HTMLElement | null>(null);

function setLineRef(index: number, el: unknown) {
  lineRefs.value[index] = el instanceof HTMLElement ? el : null;
}

function isScrollableContainer(element: HTMLElement) {
  const { overflowY } = window.getComputedStyle(element);
  return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight;
}

function findScrollContainer(startElement: HTMLElement) {
  let currentElement: HTMLElement | null = startElement.parentElement;
  while (currentElement) {
    if (isScrollableContainer(currentElement)) {
      return currentElement;
    }
    currentElement = currentElement.parentElement;
  }
  return rootRef.value;
}

function centerActiveLine(index: number) {
  const activeLineElement = lineRefs.value[index];
  if (!activeLineElement) return;

  const scrollContainer = findScrollContainer(activeLineElement);
  if (!scrollContainer) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const lineRect = activeLineElement.getBoundingClientRect();
  const rawTop = scrollContainer.scrollTop
    + (lineRect.top - containerRect.top)
    - (scrollContainer.clientHeight / 2)
    + (lineRect.height / 2);
  const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  const targetTop = Math.min(Math.max(rawTop, 0), maxTop);

  scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
}

watch(
  () => props.lrc,
  () => {
    lineRefs.value = [];
  },
);

const activeIndex = computed(() => {
  const arr = lines.value;
  if (arr.length === 0) return -1;
  const t = Math.max(0, props.currentTimeSec * 1000);
  let idx = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].timeMs <= t) idx = i;
    else break;
  }
  return idx;
});

watch(
  activeIndex,
  async (i) => {
    if (i < 0) return;
    await nextTick();
    centerActiveLine(i);
  },
);
</script>

<template>
  <div
    ref="rootRef"
    class="text-(--ui-text) leading-relaxed"
    :style="bodyStyle"
  >
    <template v-if="lines.length > 0">
      <p
        v-for="(line, i) in lines"
        :key="`${line.timeMs}-${i}`"
        :ref="(el) => setLineRef(i, el)"
        class="py-0.5 px-2 transition-colors duration-150"
        :class="i === activeIndex ? 'bg-(--ui-bg-muted) text-(--ui-color-primary-600) dark:text-(--ui-color-primary-400) font-medium' : 'text-(--ui-text-muted)'"
      >
        {{ line.text }}
      </p>
    </template>
    <div
      v-else
      class="whitespace-pre-wrap"
    >
      {{ lrc }}
    </div>
  </div>
</template>
