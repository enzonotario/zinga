<script setup lang="ts">
import type { CSSProperties, Ref } from 'vue';
import { computed, onMounted, ref } from 'vue';

interface Props {
  loading: boolean
  error: string | null
  plainLyrics: string | null
  syncedLrc: string | null
  currentTimeSec: number
  lyricsBodyStyle: CSSProperties
  registerLyricsWheelScroll: (r: Ref<HTMLElement | null | undefined>) => void
  layout: 'fullscreen' | 'floating'
  idleNoTrack?: boolean
}
const props = defineProps<Props>();
const contentScrollRef = ref<HTMLElement | null>(null);

onMounted(() => {
  props.registerLyricsWheelScroll(contentScrollRef);
});

const loadingClass = computed(() =>
  props.layout === 'fullscreen'
    ? 'flex-1 min-h-0 overflow-y-auto space-y-2 py-1'
    : 'max-h-72 overflow-y-auto space-y-2 py-1',
);

const scrollClass = computed(() =>
  props.layout === 'fullscreen'
    ? 'flex-1 min-h-0 overflow-y-auto'
    : 'max-h-72 overflow-y-auto',
);

const syncedBodyStyle = computed(
  () => props.lyricsBodyStyle as Record<string, string>,
);
</script>

<template>
  <div
    v-if="loading"
    :class="loadingClass"
    role="status"
    :aria-label="$t('lyrics.searching')"
    class="px-2 !py-2"
  >
    <template v-if="layout === 'fullscreen'">
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[94%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[88%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[96%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-4/5" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[90%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-3/4" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[82%]" />
    </template>
    <template v-else>
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[94%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[88%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-[96%]" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-4/5" />
    </template>
  </div>
  <div
    v-else-if="error && layout === 'fullscreen'"
    class="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
  >
    <p class="text-sm text-(--ui-text-muted)">
      {{ error }}
    </p>
  </div>
  <p
    v-else-if="error && layout === 'floating'"
    class="text-sm text-(--ui-text-muted)"
  >
    {{ error }}
  </p>
  <div
    v-else-if="syncedLrc"
    ref="contentScrollRef"
    :class="scrollClass"
  >
    <LyricsSyncedLyricsView
      :lrc="syncedLrc"
      :current-time-sec="currentTimeSec"
      :body-style="syncedBodyStyle"
    />
  </div>
  <div
    v-else-if="plainLyrics"
    ref="contentScrollRef"
    class="whitespace-pre-wrap leading-relaxed text-(--ui-text) px-2"
    :class="scrollClass"
    :style="lyricsBodyStyle"
  >
    {{ plainLyrics }}
  </div>
  <div
    v-else-if="idleNoTrack"
    ref="contentScrollRef"
    :class="scrollClass"
    class="flex min-h-[8rem] flex-col justify-center px-3 py-4 sm:px-4"
  >
    <UEmpty
      icon="i-heroicons-musical-note"
      :title="$t('lyrics.noPlayback')"
      :description="$t('lyrics.noPlaybackDescription')"
    />
  </div>
</template>
