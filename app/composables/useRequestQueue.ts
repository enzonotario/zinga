import { computed, readonly, ref } from 'vue';

export default function useRequestQueue() {
  const queue = ref<Array<() => Promise<any>>>([]);
  const isProcessing = ref(false);
  const concurrency = ref(2);
  const delay = ref(500);
  async function processQueue() {
    if (isProcessing.value || queue.value.length === 0) return;
    isProcessing.value = true;
    while (queue.value.length > 0) {
      const batch: Array<() => Promise<any>> = [];
      const batchSize = Math.min(concurrency.value, queue.value.length);
      for (let i = 0; i < batchSize; i++) {
        const task = queue.value.shift();
        if (task) batch.push(task);
      }
      await Promise.all(
        batch.map(async (task) => {
          try {
            await task();
          } catch (error) {
            console.error('Error en tarea de la cola:', error);
          }
        }),
      );
      if (queue.value.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay.value));
      }
    }
    isProcessing.value = false;
  }
  function enqueue(task: () => Promise<any>, retries = 3, retryDelay = 1000): Promise<any> {
    return new Promise((resolve, reject) => {
      const taskWithRetry = async (): Promise<any> => {
        let lastError: any;
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const result = await task();
            resolve(result);
            return result;
          } catch (error: any) {
            lastError = error;
            const status = error?.status || error?.code || error?.response?.status;
            const message = error?.message || '';
            const isRateLimit = status === 429
              || message.includes('429')
              || message.includes('rate limit')
              || message.includes('Too Many Requests');
            if (isRateLimit && attempt < retries) {
              const waitTime = retryDelay * (2 ** attempt);
              console.warn(`Rate limit alcanzado. Reintentando en ${waitTime}ms (intento ${attempt + 1}/${retries})`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              continue;
            }
            reject(error);
            throw error;
          }
        }
        reject(lastError);
        throw lastError;
      };
      queue.value.push(taskWithRetry);
      processQueue();
    });
  }
  function clear() {
    queue.value = [];
  }
  function setDelay(ms: number) {
    delay.value = ms;
  }
  function setConcurrency(count: number) {
    concurrency.value = count;
  }
  return {
    enqueue,
    clear,
    setDelay,
    setConcurrency,
    isProcessing: readonly(isProcessing),
    queueLength: computed(() => queue.value.length),
  };
}
