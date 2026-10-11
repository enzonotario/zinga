import { computed, ref } from 'vue';

interface ServerInfo {
  ip: string
  port: number
  pairingCode: string
}
interface ServerStatus extends ServerInfo {
  running: boolean
}
interface PairedDevice {
  id: string
  name: string
  token: string
  pairedAt: number
}
const serverInfo = ref<ServerInfo | null>(null);
const isRunning = ref(false);
const pairedDevices = ref<PairedDevice[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let tokenSyncInterval: ReturnType<typeof setInterval> | null = null;
let eventUnlisten: (() => void) | null = null;
let restoreStarted = false;
export default function useRemoteServer() {
  const { t } = useI18n();
  const serverUrl = computed(() => {
    if (!serverInfo.value) return null;
    return `http://${serverInfo.value.ip}:${serverInfo.value.port}`;
  });
  const pairingUrl = computed(() => {
    if (!serverInfo.value) return null;
    return `${serverUrl.value}?code=${serverInfo.value.pairingCode}`;
  });
  async function closeOtherInstances() {
    loading.value = true;
    error.value = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const closed = await invoke<number>('remote_close_other_instances');
      if (closed === 0) {
        error.value = t('pages.settings.noOtherInstances');
        return 0;
      }
      await startServer();
      return closed;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return 0;
    } finally {
      loading.value = false;
    }
  }
  async function startServer() {
    loading.value = true;
    error.value = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<ServerInfo>('remote_server_start');
      serverInfo.value = result;
      isRunning.value = true;
      await refreshPairedDevices();
      startTokenSync();
      listenForPairingEvents();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }
  async function stopServer() {
    loading.value = true;
    error.value = null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remote_server_stop');
      isRunning.value = false;
      serverInfo.value = null;
      stopTokenSync();
      stopListeningForPairingEvents();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }
  async function refreshPairingCode() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const code = await invoke<string>('remote_get_pairing_code');
      if (serverInfo.value) {
        serverInfo.value = { ...serverInfo.value, pairingCode: code };
      }
    } catch (err) {
      console.error('Error refreshing pairing code:', err);
    }
  }
  async function refreshPairedDevices() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      pairedDevices.value = await invoke<PairedDevice[]>('remote_get_paired_devices');
    } catch (err) {
      console.error('Error fetching paired devices:', err);
    }
  }
  async function revokeDevice(deviceId: string) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remote_revoke_device', { deviceId });
      await refreshPairedDevices();
    } catch (err) {
      console.error('Error revoking device:', err);
    }
  }
  async function syncTidalToken() {
    try {
      const tidalAuth = useTidalAuth();
      const token = await tidalAuth.getAccessToken();
      if (!token) return;
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remote_set_tidal_token', { token });
    } catch (err) {
      console.error('Error syncing Tidal token:', err);
    }
  }
  function startTokenSync() {
    syncTidalToken();
    tokenSyncInterval = setInterval(syncTidalToken, 60_000);
  }
  function stopTokenSync() {
    if (tokenSyncInterval) {
      clearInterval(tokenSyncInterval);
      tokenSyncInterval = null;
    }
  }
  async function listenForPairingEvents() {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('remote:device_paired', () => {
        refreshPairedDevices();
      });
      eventUnlisten = unlisten;
    } catch (err) {
      console.error('Error listening for pairing events:', err);
    }
  }
  function stopListeningForPairingEvents() {
    if (eventUnlisten) {
      eventUnlisten();
      eventUnlisten = null;
    }
  }
  async function restoreServer() {
    if (restoreStarted) return;
    restoreStarted = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      for (let attempt = 0; attempt < 10; attempt++) {
        const status = await invoke<ServerStatus>('remote_server_status');
        if (status.running) {
          serverInfo.value = {
            ip: status.ip,
            port: status.port,
            pairingCode: status.pairingCode,
          };
          isRunning.value = true;
          await refreshPairedDevices();
          startTokenSync();
          listenForPairingEvents();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error('Remote server restore error:', err);
    }
  }
  if (import.meta.client) void restoreServer();
  return {
    serverInfo: computed(() => serverInfo.value),
    isRunning: computed(() => isRunning.value),
    pairedDevices: computed(() => pairedDevices.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    serverUrl,
    pairingUrl,
    startServer,
    closeOtherInstances,
    stopServer,
    refreshPairingCode,
    refreshPairedDevices,
    revokeDevice,
  };
}
