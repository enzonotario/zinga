import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';
import useOpenExternalLink from './useOpenExternalLink';

export const TIDAL_NOT_LOGGED_IN = 'TIDAL_NOT_LOGGED_IN';
export const TIDAL_LOGIN_INVALID_URL = 'TIDAL_LOGIN_INVALID_URL';
export const TIDAL_LOGIN_EXPIRED = 'TIDAL_LOGIN_EXPIRED';

interface TidalPlaybackStatus {
  loggedIn: boolean
  countryCode: string | null
}

interface TidalLoginResult {
  ok: boolean
  error: string | null
}

const status = ref<TidalPlaybackStatus>({ loggedIn: false, countryCode: null });

export default function useTidalPlayback() {
  const { openExternalLink } = useOpenExternalLink();

  async function refresh() {
    status.value = await invoke<TidalPlaybackStatus>('tidal_session_status');
  }

  async function startLogin() {
    const url = await invoke<string>('tidal_login_url');
    await openExternalLink(url);
  }

  async function completeLogin(redirectUrl: string): Promise<TidalLoginResult> {
    try {
      await invoke('tidal_login_complete', { redirectUrl });
      await refresh();
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function logout() {
    await invoke('tidal_logout');
    await refresh();
  }

  return {
    status,
    refresh,
    startLogin,
    completeLogin,
    logout,
  };
}
