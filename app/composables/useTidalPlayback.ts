import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ref } from 'vue';

export const TIDAL_NOT_LOGGED_IN = 'TIDAL_NOT_LOGGED_IN';
export const TIDAL_LOGIN_CANCELLED = 'TIDAL_LOGIN_CANCELLED';

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
  async function refresh() {
    status.value = await invoke<TidalPlaybackStatus>('tidal_session_status');
  }

  async function login(): Promise<TidalLoginResult> {
    let resolveFinished: (result: TidalLoginResult) => void = () => {};
    const finished = new Promise<TidalLoginResult>((resolve) => {
      resolveFinished = resolve;
    });
    const unlisten = await listen<TidalLoginResult>('tidal-login-finished', (event) => resolveFinished(event.payload));
    try {
      await invoke('tidal_login_start');
      const result = await finished;
      await refresh();
      return result;
    } finally {
      unlisten();
    }
  }

  async function logout() {
    await invoke('tidal_logout');
    await refresh();
  }

  return {
    status,
    refresh,
    login,
    logout,
  };
}
