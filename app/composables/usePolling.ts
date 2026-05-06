import type { Ref } from 'vue';
import { onUnmounted, ref } from 'vue';

export function usePolling(options: {
  callback: () => void | Promise<void>
  interval: number
  enabled?: Ref<boolean>
  pauseFlag?: Ref<boolean>
}) {
  const { callback, interval, enabled = ref(true), pauseFlag = ref(false) } = options;
  const intervalId = ref<ReturnType<typeof setInterval> | null>(null);
  const resumeTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (intervalId.value) return;
    intervalId.value = setInterval(() => {
      if (enabled.value && !pauseFlag.value) {
        callback();
      }
    }, interval);
  };
  const stop = () => {
    if (intervalId.value) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
  };
  const pause = () => {
    pauseFlag.value = true;
  };
  const resume = (delay = 0) => {
    if (resumeTimeout.value) {
      clearTimeout(resumeTimeout.value);
    }
    resumeTimeout.value = setTimeout(() => {
      pauseFlag.value = false;
      resumeTimeout.value = null;
    }, delay);
  };
  const pauseWithResume = (delay: number) => {
    pause();
    resume(delay);
  };
  onUnmounted(() => {
    stop();
    if (resumeTimeout.value) {
      clearTimeout(resumeTimeout.value);
    }
  });
  return {
    start,
    stop,
    pause,
    resume,
    pauseWithResume,
    isActive: intervalId,
  };
}
