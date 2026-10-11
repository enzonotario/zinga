import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useRemoteClient from './useRemoteClient';

class FakeSocket {
  static CONNECTING = 0;

  static OPEN = 1;

  static CLOSING = 2;

  static CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send() {
    this.readyState = FakeSocket.OPEN;
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useRemoteClient session', () => {
  let rejectSession = false;

  beforeEach(() => {
    rejectSession = false;
    localStorage.clear();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/pair/verify')) return json({ token: 'tok-1', deviceId: 'dev' });
      if (rejectSession) return new Response('unauthorized', { status: 401 });
      if (url.includes('/api/queue')) return json([]);
      if (url.includes('/api/devices')) return json({ devices: [], selectedDeviceId: null, volume: null });
      return json({ state: 'stopped', position: 0, track: null });
    }));
  });

  afterEach(() => {
    useRemoteClient().disconnect();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps the server and token when leaving client mode', async () => {
    const client = useRemoteClient();
    await client.connect('10.0.0.8', 9632, '123456');
    await client.setClientMode(false);

    expect(client.isRemoteMode.value).toBe(false);
    expect(client.hasSavedSession.value).toBe(true);
    expect(localStorage.getItem('remoteClient:serverUrl')).toBe('http://10.0.0.8:9632');
    expect(localStorage.getItem('remoteClient:token')).toBe('tok-1');
    expect(localStorage.getItem('remoteClient:active')).toBe('0');
  });

  it('reconnects with the saved token and does not pair again', async () => {
    const client = useRemoteClient();
    await client.connect('10.0.0.8', 9632, '123456');
    await client.setClientMode(false);
    await client.setClientMode(true);

    const pairCalls = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes('/api/pair/verify'));
    expect(client.isRemoteMode.value).toBe(true);
    expect(pairCalls).toHaveLength(1);
    expect(localStorage.getItem('remoteClient:active')).toBe('1');
  });

  it('drops the token when the server rejects the saved session and keeps the address', async () => {
    const client = useRemoteClient();
    await client.connect('10.0.0.8', 9632, '123456');
    await client.setClientMode(false);
    rejectSession = true;
    await client.setClientMode(true);

    expect(client.isRemoteMode.value).toBe(false);
    expect(client.hasSavedSession.value).toBe(false);
    expect(client.sessionRejected.value).toBe(true);
    expect(localStorage.getItem('remoteClient:token')).toBeNull();
    expect(localStorage.getItem('remoteClient:serverUrl')).toBe('http://10.0.0.8:9632');
  });
});
