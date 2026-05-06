import useProvider from '~/composables/useProvider';
import { initializeProviders } from '~/providers';

export default defineNuxtPlugin(async () => {
  initializeProviders();
  const provider = useProvider();
  await provider.init();
});
