<script lang="ts" setup>
import { computed } from 'vue';

interface WimpSegment {
  type: 'text' | 'artist-link' | 'album-link'
  text: string
  id?: string
}
interface Props {
  text: string | null | undefined
}
const props = defineProps<Props>();
const BR_REGEX = /<br\s*\/?>/gi;
const paragraphs = computed(() => {
  if (!props.text) return [];
  const normalized = props.text.replace(BR_REGEX, '\n');
  return normalized.split('\n').filter((p) => p.trim()).map((p) => parse(p));
});
const WIMP_LINK_REGEX = /\[wimpLink\s+(artistId|albumId)="(\d+)"\](.*?)\[\/wimpLink\]/g;
function parse(raw: string): WimpSegment[] {
  const result: WimpSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(WIMP_LINK_REGEX);
  for (let match = regex.exec(raw); match !== null; match = regex.exec(raw)) {
    if (match.index > lastIndex) {
      result.push({ type: 'text', text: raw.slice(lastIndex, match.index) });
    }
    const [, linkType, id, text] = match;
    result.push({
      type: linkType === 'artistId' ? 'artist-link' : 'album-link',
      text,
      id,
    });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < raw.length) {
    result.push({ type: 'text', text: raw.slice(lastIndex) });
  }
  return result;
}
function toPlainText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(BR_REGEX, ' ')
    .replace(WIMP_LINK_REGEX, '$3')
    .replace(/\s+/g, ' ')
    .trim();
}
defineExpose({ toPlainText });
</script>

<template>
  <div>
    <p v-for="(segments, i) in paragraphs" :key="i" class="mb-3 last:mb-0">
      <template v-for="(segment, j) in segments" :key="j">
        <NuxtLink
          v-if="segment.type === 'artist-link' || segment.type === 'album-link'"
          :to="`/${segment.type === 'artist-link' ? 'artist' : 'album'}/${segment.id}`"
          class="text-primary hover:underline"
        >
          {{ segment.text }}
        </NuxtLink>
        <template v-else>
          {{ segment.text }}
        </template>
      </template>
    </p>
  </div>
</template>
