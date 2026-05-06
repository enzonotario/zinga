import type { MusicProvider, ProviderId } from './types';
import { ref } from 'vue';
import { getTidalProvider } from './tidal';

const providers = new Map<ProviderId, MusicProvider>();
const currentProviderId = ref<ProviderId>('tidal');
export function registerProvider(provider: MusicProvider): void {
  providers.set(provider.id, provider);
}
export function getProvider(id: ProviderId): MusicProvider | undefined {
  return providers.get(id);
}
export function getCurrentProvider(): MusicProvider {
  const provider = providers.get(currentProviderId.value);
  if (!provider) {
    throw new Error(`Provider '${currentProviderId.value}' not found`);
  }
  return provider;
}
export function setCurrentProvider(id: ProviderId): void {
  if (!providers.has(id)) {
    throw new Error(`Provider '${id}' not registered`);
  }
  currentProviderId.value = id;
}
export function getCurrentProviderId(): ProviderId {
  return currentProviderId.value;
}
export function getAllProviders(): MusicProvider[] {
  return Array.from(providers.values());
}
export function initializeProviders(): void {
  const tidal = getTidalProvider();
  registerProvider(tidal);
}
export { getTidalProvider } from './tidal';
export * from './types';
export default {
  registerProvider,
  getProvider,
  getCurrentProvider,
  setCurrentProvider,
  getCurrentProviderId,
  getAllProviders,
  initializeProviders,
};
