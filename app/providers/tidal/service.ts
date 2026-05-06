import { createAPIClient } from '@tidal-music/api';
import * as auth from '@tidal-music/auth';
import { ref } from 'vue';

export const CLIENT_ID = 'fX2JxdmntZWK0ixT';
export const CLIENT_SECRET = '1Nn9AfDAjxrgJFJbKNWLeAyKGVGmINuXPPLHVXAvxAg=';
export const USER_SCOPES = ['r_usr', 'w_usr'];
interface CacheEntry {
  data: any
  timestamp: number
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;
export function getCached(url: string): any | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(url);
    return null;
  }
  return entry.data;
}
export function setCached(url: string, data: any): void {
  cache.set(url, { data, timestamp: Date.now() });
}
export function clearCache(): void {
  cache.clear();
}
let apiClient: ReturnType<typeof createAPIClient> | null = null;
export const getAPIClient = () => {
  if (!apiClient) {
    apiClient = createAPIClient(auth.credentialsProvider);
  }
  return apiClient;
};
export const isInitialized = ref(false);
export const isUserLoggedIn = ref(false);
export const error = ref<string | null>(null);
export const isLoading = ref(false);
export const deviceLoginPending = ref(false);
export const deviceLoginInfo = ref<any | null>(null);
export async function checkAuth() {
  if (!isInitialized.value) {
    isUserLoggedIn.value = false;
    return;
  }
  try {
    const credentials = await auth.credentialsProvider.getCredentials();
    isUserLoggedIn.value = !!(credentials?.token && credentials.userId);
  } catch (err) {
    isUserLoggedIn.value = false;
    console.error('Error verifying authentication:', err);
  }
}
export async function getCurrentUser() {
  const cacheKey = 'currentUser';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;
  const client = getAPIClient();
  const response = await client.GET('/users/me');
  if (response.error) {
    throw new Error(`Error getting current user: ${JSON.stringify(response.error)}`);
  }
  if (response.data) {
    setCached(cacheKey, response.data);
  }
  return response.data;
}
export async function initAuth(force = false) {
  if (isInitialized.value && !force) return;
  isLoading.value = true;
  error.value = null;
  try {
    await auth.init({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      credentialsStorageKey: 'tidal_credentials',
      scopes: USER_SCOPES,
    });
    isInitialized.value = true;
    await checkAuth();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error initializing Tidal authentication';
    console.error('Error initializing Tidal Auth:', err);
    isUserLoggedIn.value = false;
  } finally {
    isLoading.value = false;
  }
}
