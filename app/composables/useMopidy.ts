import { computed, ref } from 'vue';
import useRemoteClient from './useRemoteClient';

export interface MopidyTrack {
  uri: string
  name?: string
  artists?: Array<{ name: string }>
  album?: { name: string, uri?: string }
  length?: number
  [key: string]: any
}
export interface MopidyTlTrack {
  tlid: number
  track: MopidyTrack
}
export interface MopidyState {
  state: 'playing' | 'paused' | 'stopped'
  time_position: number
  track: MopidyTlTrack | null
}
const isConnected = ref(false);
const currentState = ref<MopidyState>({
  state: 'stopped',
  time_position: 0,
  track: null,
});
const tracklist = ref<MopidyTlTrack[]>([]);
export default function useMopidy() {
  const remote = useRemoteClient();
  async function getMopidyBaseUrl(): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const ip = await invoke<string>('get_host_ip').catch(() => 'localhost');
      return `http://${ip}:6680/mopidy/rpc`;
    } catch {
      return 'http://localhost:6680/mopidy/rpc';
    }
  }
  async function mopidyRpc(method: string, params: Record<string, any> = {}): Promise<any> {
    if (remote.isRemoteMode.value) {
      return await remoteMopidyCall(remote, method, params);
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('mopidy_rpc', { method, params });
    } catch {
      const url = await getMopidyBaseUrl();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!response.ok) throw new Error(`Mopidy HTTP Error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Mopidy RPC Error');
      return data.result;
    }
  }
  async function refreshState() {
    try {
      const [state, position, tlTrack] = await Promise.all([
        mopidyRpc('core.playback.get_state'),
        mopidyRpc('core.playback.get_time_position'),
        mopidyRpc('core.playback.get_current_tl_track'),
      ]);
      currentState.value = {
        state: state || 'stopped',
        time_position: position || 0,
        track: tlTrack || null,
      };
      isConnected.value = true;
    } catch (err) {
      console.error('Failed to refresh Mopidy state:', err);
      isConnected.value = false;
    }
  }
  async function getTracklist() {
    try {
      const tracks = await mopidyRpc('core.tracklist.get_tl_tracks');
      tracklist.value = tracks || [];
      return tracklist.value;
    } catch (err) {
      console.error('Failed to get Mopidy tracklist:', err);
      return [];
    }
  }
  async function play() {
    await mopidyRpc('core.playback.play');
    await refreshState();
  }
  async function pause() {
    await mopidyRpc('core.playback.pause');
    await refreshState();
  }
  async function resume() {
    await mopidyRpc('core.playback.resume');
    await refreshState();
  }
  async function stop() {
    await mopidyRpc('core.playback.stop');
    await refreshState();
  }
  async function seek(ms: number) {
    await mopidyRpc('core.playback.seek', { time_position: ms });
    await refreshState();
  }
  async function next() {
    await mopidyRpc('core.playback.next');
    await refreshState();
  }
  async function previous() {
    await mopidyRpc('core.playback.previous');
    await refreshState();
  }
  async function clear() {
    await mopidyRpc('core.tracklist.clear');
    await getTracklist();
  }
  async function add(uris: string[]) {
    const tlTracks = await mopidyRpc('core.tracklist.add', { uris });
    await getTracklist();
    return tlTracks;
  }
  async function getStreamUri(uri: string): Promise<string | null> {
    try {
      return await mopidyRpc('core.playback.get_stream_uri', { uri });
    } catch {
      return null;
    }
  }
  async function refresh() {
    await Promise.all([refreshState(), getTracklist()]);
  }
  return {
    isConnected,
    currentState,
    tracklist,
    isPlaying: computed(() => currentState.value.state === 'playing'),
    isPaused: computed(() => currentState.value.state === 'paused'),
    currentTrack: computed(() => currentState.value.track),
    position: computed(() => currentState.value.time_position),
    mopidyRpc,
    refreshState,
    getTracklist,
    refresh,
    play,
    pause,
    resume,
    stop,
    seek,
    next,
    previous,
    clear,
    add,
    getStreamUri,
  };
}
async function remoteMopidyCall(remote: any, method: string, params: any) {
  console.log('Remote Mopidy Call:', method, params);
  return null;
}
