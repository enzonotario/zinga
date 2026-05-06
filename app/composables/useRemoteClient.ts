import { computed, ref, watch } from 'vue';

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
const serverUrl = ref<string | null>(null);
const token = ref<string | null>(null);
const connectionStatus = ref<ConnectionStatus>('disconnected');
const lastPlaybackState = ref<PlaybackState | null>(null);
const lastQueueUpdate = ref<any[] | null>(null);
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const playbackCallbacks: Set<(state: PlaybackState) => void> = new Set();
const queueCallbacks: Set<(queue: any[]) => void> = new Set();
if (import.meta.client) {
  serverUrl.value = localStorage.getItem(STORAGE_KEY_URL);
  token.value = localStorage.getItem(STORAGE_KEY_TOKEN);
}
const isRemoteMode = computed(() => !!serverUrl.value && !!token.value);
function openWebSocket() {
  if (!serverUrl.value || !token.value) return;
  closeWebSocket();
  const wsUrl = `${serverUrl.value.replace(/^http/, 'ws')}/ws`;
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
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY_URL, url);
    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
  }
  openWebSocket();
}
function disconnect() {
  closeWebSocket();
  serverUrl.value = null;
  token.value = null;
  connectionStatus.value = 'disconnected';
  lastPlaybackState.value = null;
  lastQueueUpdate.value = null;
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
  }
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}
function onPlaybackState(callback: (state: PlaybackState) => void): () => void {
  playbackCallbacks.add(callback);
  return () => playbackCallbacks.delete(callback);
}
function onQueueUpdated(callback: (queue: any[]) => void): () => void {
  queueCallbacks.add(callback);
  return () => queueCallbacks.delete(callback);
}
if (import.meta.client) {
  watch(isRemoteMode, (val) => {
    if (val) openWebSocket();
    else closeWebSocket();
  }, { immediate: true });
}
async function discoverServers(): Promise<DiscoveredServer[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<DiscoveredServer[]>('remote_discover_servers');
}
export default function useRemoteClient() {
  return {
    isRemoteMode,
    serverUrl: computed(() => serverUrl.value),
    token: computed(() => token.value),
    connectionStatus: computed(() => connectionStatus.value),
    lastPlaybackState: computed(() => lastPlaybackState.value),
    lastQueueUpdate: computed(() => lastQueueUpdate.value),
    connect,
    disconnect,
    apiFetch,
    onPlaybackState,
    onQueueUpdated,
    discoverServers,
  };
}
