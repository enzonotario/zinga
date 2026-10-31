<script lang="ts" setup>
import { invoke } from '@tauri-apps/api/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
let driftTimer: ReturnType<typeof setInterval> | null = null;

const SEEK_THRESHOLD_SEC = 2;

const showFallback = computed(() => failed.value || !streamUrl.value);

async function loadSource(videoId: string) {
  failed.value = false;
  streamUrl.value = null;
  if (!isYtmVideoId(videoId)) {
    failed.value = true;
    return;
  }
  try {
    await invoke('ytm_resolve_video', { videoId });
    const base = await invoke<string>('direct_stream_base_url');
    streamUrl.value = `${base.replace(/\/$/, '')}/ytm-video/${videoId}`;
  } catch (err) {
    console.warn('[VideoView] resolve failed:', err);
    failed.value = true;
  }
}

function syncPlayState() {
  const el = videoEl.value;
  if (!el || failed.value) return;
  if (!props.playing) {
    if (!el.paused) el.pause();
    return;
  }
  if (el.paused) {
    void el.play().catch(() => {
      failed.value = true;
    });
  }
}

// WebKitGTK implements playbackRate changes and seeks as GStreamer seeks, which stall the
// picture; audio and video run on real-time clocks, so only correct large drift
function correctDrift() {
  const el = videoEl.value;
  if (!el || failed.value || el.seeking || el.readyState < 2) return;
  const target = Math.max(0, props.positionSec || 0);
  const drift = Math.abs(target - el.currentTime);
  const threshold = props.playing ? SEEK_THRESHOLD_SEC : 0.25;
  if (drift > threshold) el.currentTime = target;
}

function stopDriftTimer() {
  if (!driftTimer) return;
  clearInterval(driftTimer);
  driftTimer = null;
}

function onLoadedData() {
  correctDrift();
  syncPlayState();
}

function onVideoError() {
  failed.value = true;
}

watch(() => props.videoId, (id) => void loadSource(id), { immediate: true });
watch(() => [props.playing, streamUrl.value] as const, () => {
  syncPlayState();
  correctDrift();
});

onMounted(() => {
  driftTimer = setInterval(correctDrift, 1000);
});

onBeforeUnmount(() => {
  stopDriftTimer();
  videoEl.value?.pause();
});
</script>

<template>
  <div class="flex min-h-0 w-full">
    <div class="relative w-full h-full min-h-48 overflow-hidden rounded-2xl ring ring-default bg-black">
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
        @loadeddata="onLoadedData"
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
