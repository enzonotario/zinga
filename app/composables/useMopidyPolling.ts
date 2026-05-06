import { onMounted, onUnmounted, ref } from 'vue';
import useMopidy from './useMopidy';

interface UseMopidyPollingOptions {
  interval?: number
  immediate?: boolean
  onError?: (error: unknown) => void
}
export function useMopidyPolling(options: UseMopidyPollingOptions = {}) {
  const {
    interval = 1000,
    immediate = true,
    onError,
  } = options;
  const mopidy = useMopidy();
  const isPolling = ref(false);
  let pollingId: any = null;
  async function refresh() {
    try {
      await mopidy.refresh();
    } catch (err) {
      if (onError) onError(err);
    }
  }
  function startPolling() {
    if (pollingId) return;
    isPolling.value = true;
    pollingId = setInterval(refresh, interval);
  }
  function stopPolling() {
    if (pollingId) {
      clearInterval(pollingId);
      pollingId = null;
    }
    isPolling.value = false;
  }
  onMounted(() => {
    if (immediate) {
      refresh().then(() => startPolling());
    }
  });
  onUnmounted(() => {
    stopPolling();
  });
  return {
    mopidy,
    isPolling,
    refresh,
    startPolling,
    stopPolling,
  };
}
export default useMopidyPolling;
