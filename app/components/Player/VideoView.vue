<script lang="ts" setup>
import { invoke } from '@tauri-apps/api/core';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { isYtmVideoId } from '~/utils/directStream';

interface Props {
  videoId: string
  poster?: string | null
  playing?: boolean
  positionSec?: number
}

const props = withDefaults(defineProps<Props>(), {
  poster: null,
  playing: false,
  positionSec: 0,
});

const videoEl = ref<HTMLVideoElement | null>(null);
const streamUrl = ref<string | null>(null);
const failed = ref(false);
const seeking = ref(false);
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncAt = 0;

const showFallback = computed(() => failed.value || !streamUrl.value);

async function resolveBaseUrl() {
  return invoke<string>('direct_stream_base_url');
}

async function loadSource(videoId: string) {
  failed.value = false;
  streamUrl.value = null;
  if (!isYtmVideoId(videoId)) {
    failed.value = true;
    return;
  }
  try {
    await invoke('ytm_resolve_video', { videoId });
    const base = await resolveBaseUrl();
    streamUrl.value = `${base.replace(/\/$/, '')}/ytm-video/${videoId}`;
  } catch (err) {
    console.warn('[VideoView] resolve failed:', err);
    failed.value = true;
  }
}

function clearSyncTimer() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

function syncPlayback() {
  const el = videoEl.value;
  if (!el || failed.value || !streamUrl.value) return;
  if (props.playing) {
    if (el.paused) void el.play().catch(() => {
      failed.value = true;
    });
  } else if (!el.paused) {
    el.pause();
  }

  if (seeking.value) return;
  const now = Date.now();
  if (now - lastSyncAt < 250) return;
  const target = Math.max(0, props.positionSec || 0);
  if (Math.abs(el.currentTime - target) > 0.35) {
    lastSyncAt = now;
    seeking.value = true;
    try {
      el.currentTime = target;
    } catch {
      // ignore seek failures while media loads
    }
    clearSyncTimer();
    syncTimer = setTimeout(() => {
      seeking.value = false;
    }, 200);
  }
}

function onVideoError() {
  failed.value = true;
}

watch(
  () => props.videoId,
  (id) => {
    void loadSource(id);
  },
  { immediate: true },
);

watch(
  () => [props.playing, props.positionSec, streamUrl.value] as const,
  () => syncPlayback(),
);

onBeforeUnmount(() => {
  clearSyncTimer();
  videoEl.value?.pause();
});
</script>

<template>
  <div class="w-full max-w-4xl mx-auto">
    <div class="relative aspect-video w-full overflow-hidden rounded-2xl glass ring ring-default bg-black">
      <video
        v-if="!showFallback && streamUrl"
        ref="videoEl"
        class="absolute inset-0 h-full w-full object-contain"
        :src="streamUrl"
        :poster="poster || undefined"
        muted
        playsinline
        preload="auto"
        @error="onVideoError"
        @loadeddata="syncPlayback"
      />
      <img
        v-else-if="poster"
        :src="poster"
        alt=""
        class="absolute inset-0 h-full w-full object-contain"
      >
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center text-muted"
      >
        <UIcon name="i-heroicons-film" class="w-16 h-16" />
      </div>
    </div>
  </div>
</template>
