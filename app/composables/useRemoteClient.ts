import type { RemoteDevicesSnapshot } from '~/utils/remoteSnapshot';
import { computed, ref, watch } from 'vue';
import { parseDevicesSnapshot } from '~/utils/remoteSnapshot';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
interface DiscoveredServer {
  ip: string
  port: number
  name: string
}
interface PlaybackState {
  state: 'playing' | 'paused' | 'stopped'
  position: number
  track: any | null
}
const STORAGE_KEY_URL = 'remoteClient:serverUrl';
const STORAGE_KEY_TOKEN = 'remoteClient:token';
const STORAGE_KEY_ACTIVE = 'remoteClient:active';
const serverUrl = ref<string | null>(null);
const token = ref<string | null>(null);
const clientActive = ref(false);
const sessionRejected = ref(false);
const connectionStatus = ref<ConnectionStatus>('disconnected');
const lastPlaybackState = ref<PlaybackState | null>(null);
const lastQueueUpdate = ref<{ tracks: any[] } | null>(null);
const lastDevices = ref<RemoteDevicesSnapshot | null>(null);
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statePollTimer: ReturnType<typeof setInterval> | null = null;
const playbackCallbacks: Set<(state: PlaybackState) => void> = new Set();
const queueCallbacks: Set<(queue: { tracks: any[] }) => void> = new Set();
class RemoteUnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
  }
}
function storageAvailable() {
  return typeof localStorage !== 'undefined';
}
if (storageAvailable()) {
  serverUrl.value = localStorage.getItem(STORAGE_KEY_URL);
  token.value = localStorage.getItem(STORAGE_KEY_TOKEN);
  clientActive.value = !!serverUrl.value && !!token.value && localStorage.getItem(STORAGE_KEY_ACTIVE) !== '0';
}
const isRemoteMode = computed(() => clientActive.value && !!serverUrl.value && !!token.value);
const hasSavedSession = computed(() => !!serverUrl.value && !!token.value);
function persistSession() {
  if (!storageAvailable()) return;
  if (serverUrl.value) localStorage.setItem(STORAGE_KEY_URL, serverUrl.value);
  else localStorage.removeItem(STORAGE_KEY_URL);
  if (token.value) localStorage.setItem(STORAGE_KEY_TOKEN, token.value);
  else localStorage.removeItem(STORAGE_KEY_TOKEN);
  if (serverUrl.value && token.value) localStorage.setItem(STORAGE_KEY_ACTIVE, clientActive.value ? '1' : '0');
  else localStorage.removeItem(STORAGE_KEY_ACTIVE);
}
function clearSnapshots() {
  lastPlaybackState.value = null;
  lastQueueUpdate.value = null;
  lastDevices.value = null;
}
function forgetSession(rejected = false) {
  closeWebSocket();
  stopStatePoll();
  if (!rejected) serverUrl.value = null;
  token.value = null;
  clientActive.value = false;
  connectionStatus.value = 'disconnected';
  clearSnapshots();
  sessionRejected.value = rejected;
  persistSession();
}
function openWebSocket() {
  if (!serverUrl.value || !token.value) return;
  closeWebSocket();
  const wsUrl = `${serverUrl.value.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token.value)}`;
  connectionStatus.value = 'connecting';
  const socket = new WebSocket(wsUrl);
  ws = socket;
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'auth', token: token.value }));
    connectionStatus.value = 'connected';
  };
  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'playback_state') {
        lastPlaybackState.value = msg.data;
        playbackCallbacks.forEach((cb) => cb(msg.data));
      } else if (msg.type === 'queue_updated') {
        lastQueueUpdate.value = msg.data;
        queueCallbacks.forEach((cb) => cb(msg.data));
      } else if (msg.type === 'device_changed') {
        lastDevices.value = parseDevicesSnapshot(msg.data);
      } else if (msg.type === 'error' && msg.data === 'unauthorized') {
        forgetSession(true);
        connectionStatus.value = 'error';
      }
    } catch {}
  };
  socket.onclose = () => {
    if (isRemoteMode.value) {
      connectionStatus.value = 'disconnected';
      scheduleReconnect();
    }
  };
  socket.onerror = () => {
    connectionStatus.value = 'error';
  };
}
function closeWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }
}
async function pollRemoteState() {
  if (!clientActive.value || !serverUrl.value || !token.value) return;
  try {
    const [playback, queue, devices] = await Promise.all([
      apiFetch('/api/playback/state'),
      apiFetch('/api/queue'),
      apiFetch('/api/devices'),
    ]);
    if (!clientActive.value) return;
    lastPlaybackState.value = playback;
    lastQueueUpdate.value = { tracks: Array.isArray(queue) ? queue : [] };
    lastDevices.value = parseDevicesSnapshot(devices);
    if (connectionStatus.value !== 'connected') connectionStatus.value = 'connected';
  } catch (err) {
    if (err instanceof RemoteUnauthorizedError) throw err;
    if (ws?.readyState !== WebSocket.OPEN) connectionStatus.value = 'disconnected';
  }
}
function startStatePoll() {
  if (statePollTimer) return;
  void pollRemoteState().catch(() => {});
  statePollTimer = setInterval(() => {
    void pollRemoteState().catch(() => {});
  }, 1000);
}
function stopStatePoll() {
  if (!statePollTimer) return;
  clearInterval(statePollTimer);
  statePollTimer = null;
}
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (isRemoteMode.value) openWebSocket();
  }, 3000);
}
async function connect(ip: string, port: number, code: string): Promise<void> {
  const url = `http://${ip}:${port}`;
  connectionStatus.value = 'connecting';
  const res = await fetch(`${url}/api/pair/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, device_name: 'Zinga Remote' }),
  });
  if (!res.ok) {
    connectionStatus.value = 'error';
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  const data = await res.json();
  serverUrl.value = url;
  token.value = data.token;
  clientActive.value = true;
  sessionRejected.value = false;
  persistSession();
  openWebSocket();
}
async function setClientMode(enabled: boolean) {
  if (!enabled) {
    clientActive.value = false;
    connectionStatus.value = 'disconnected';
    clearSnapshots();
    persistSession();
    return;
  }
  if (!serverUrl.value || !token.value) return;
  clientActive.value = true;
  connectionStatus.value = 'connecting';
  persistSession();
  try {
    await pollRemoteState();
  } catch (err) {
    if (!(err instanceof RemoteUnauthorizedError)) throw err;
  }
}
function disconnect() {
  forgetSession(false);
}
async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  if (!serverUrl.value || !token.value) throw new Error('Not connected to remote server');
  const res = await fetch(`${serverUrl.value}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.value}`,
      ...(options?.headers || {}),
    },
  });
  if (res.status === 401) {
    forgetSession(true);
    connectionStatus.value = 'error';
    throw new RemoteUnauthorizedError();
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}
async function sendCommand(action: string, data?: Record<string, unknown>): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'command', action, data }));
    return;
  }
  await apiFetch(`/api/playback/${action}`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}
function onPlaybackState(callback: (state: PlaybackState) => void): () => void {
  playbackCallbacks.add(callback);
  return () => playbackCallbacks.delete(callback);
}
function onQueueUpdated(callback: (queue: { tracks: any[] }) => void): () => void {
  queueCallbacks.add(callback);
  return () => queueCallbacks.delete(callback);
}
if (import.meta.client) {
  watch(isRemoteMode, (val) => {
    if (val) {
      openWebSocket();
      startStatePoll();
    } else {
      closeWebSocket();
      stopStatePoll();
    }
  }, { immediate: true });
}
async function discoverServers(): Promise<DiscoveredServer[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DiscoveredServer[]>('remote_discover_servers');
}
export default function useRemoteClient() {
  return {
    isRemoteMode,
    hasSavedSession,
    sessionRejected: computed(() => sessionRejected.value),
    serverUrl: computed(() => serverUrl.value),
    token: computed(() => token.value),
    connectionStatus: computed(() => connectionStatus.value),
    lastPlaybackState: computed(() => lastPlaybackState.value),
    lastQueueUpdate: computed(() => lastQueueUpdate.value),
    lastDevices: computed(() => lastDevices.value),
    connect,
    setClientMode,
    disconnect,
    apiFetch,
    sendCommand,
    onPlaybackState,
    onQueueUpdated,
    discoverServers,
  };
}
