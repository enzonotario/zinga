const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

const TOKEN_KEY = 'zinga_remote_token';
const BASE_URL = window.location.origin;

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getHeaders() {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api(method, path, body) {
  const opts = { method, headers: getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${BASE_URL}${path}`, opts);
  if (resp.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

createApp({
  setup() {
    const screen = ref(getStoredToken() ? 'playing' : 'pairing');
    const pairingCode = ref('');
    const pairing = ref(false);
    const pairError = ref('');

    const playbackState = ref('stopped');
    const playbackPosition = ref(0);
    const currentTrack = ref(null);
    const queue = ref([]);

    const searchQuery = ref('');
    const searching = ref(false);
    const searchResults = ref(null);

    let ws = null;
    let positionInterval = null;

    const trackDuration = computed(() => {
      return (currentTrack.value?.track?.length || 0) / 1000;
    });

    const tabs = [
      { id: 'playing', label: 'Ahora', icon: '♪' },
      { id: 'queue', label: 'Cola', icon: '☰' },
      { id: 'browse', label: 'Buscar', icon: '🔍' },
    ];

    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code');
    if (codeFromUrl && !getStoredToken()) {
      pairingCode.value = codeFromUrl;
    }

    async function pair() {
      if (pairingCode.value.length !== 6) return;
      pairing.value = true;
      pairError.value = '';
      try {
        const result = await fetch(`${BASE_URL}/api/pair/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: pairingCode.value, device_name: 'Phone' }),
        });
        if (!result.ok) {
          pairError.value = 'Código inválido o expirado';
          return;
        }
        const data = await result.json();
        storeToken(data.token);
        screen.value = 'playing';

        window.history.replaceState({}, '', '/');
        connectWs();
        fetchState();
        fetchQueue();
      } catch (err) {
        pairError.value = err.message || 'Error de conexión';
      } finally {
        pairing.value = false;
      }
    }

    function connectWs() {
      const token = getStoredToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWsMessage(msg);
        } catch {

        }
      };

      ws.onclose = () => {
        setTimeout(connectWs, 3000);
      };
    }

    function handleWsMessage(msg) {
      if (msg.type === 'playback_state') {
        playbackState.value = msg.data.state || 'stopped';
        playbackPosition.value = (msg.data.position || 0) / 1000;
        if (msg.data.track) {
          currentTrack.value = msg.data.track;
        }
      } else if (msg.type === 'queue_updated') {
        queue.value = msg.data.tracks || [];
      }
    }

    async function fetchState() {
      try {
        const data = await api('GET', '/api/playback/state');
        playbackState.value = data.state || 'stopped';
        playbackPosition.value = (data.position || 0) / 1000;
        if (data.track) currentTrack.value = data.track;
      } catch {

      }
    }

    async function fetchQueue() {
      try {
        const data = await api('GET', '/api/queue');
        queue.value = Array.isArray(data) ? data : [];
      } catch {

      }
    }

    async function command(action, data) {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'command', action, data }));
        } else {
          const endpoint = `/api/playback/${action}`;
          await api('POST', endpoint, data);
        }
      } catch {

      }
    }

    async function seek(value) {
      const posMs = Math.round(Number(value) * 1000);
      await command('seek', { time_position: posMs });
    }

    async function doSearch() {
      if (!searchQuery.value.trim()) return;
      searching.value = true;
      searchResults.value = null;
      try {
        const data = await api('GET', `/api/tidal/search?q=${encodeURIComponent(searchQuery.value)}`);
        const included = data.included || [];
        const relationships = data.data?.relationships || {};

        const artists = (relationships.artists?.data || []).map((r) => {
          const full = included.find((i) => i.type === 'artists' && i.id === r.id);
          return full || r;
        });
        const albums = (relationships.albums?.data || []).map((r) => {
          const full = included.find((i) => i.type === 'albums' && i.id === r.id);
          return full || r;
        });
        const tracks = (relationships.tracks?.data || []).map((r) => {
          const full = included.find((i) => i.type === 'tracks' && i.id === r.id);
          return full || r;
        });

        searchResults.value = { artists, albums, tracks };
      } catch {
        searchResults.value = { artists: [], albums: [], tracks: [] };
      } finally {
        searching.value = false;
      }
    }

    async function playAlbum(albumId) {
      try {
        await api('POST', '/api/queue/play-album', { album_id: albumId });
        screen.value = 'playing';
        fetchState();
        fetchQueue();
      } catch {

      }
    }

    async function viewArtist(artistId) {
      try {
        const data = await api('GET', `/api/tidal/artist/${artistId}/albums`);
        const albums = (data.data || []).map((a) => ({
          id: a.id,
          attributes: a.attributes || {},
        }));
        searchResults.value = { artists: [], albums, tracks: [] };
      } catch {

      }
    }

    function formatTime(seconds) {
      if (!seconds || Number.isNaN(seconds)) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function startPositionTicker() {
      positionInterval = setInterval(() => {
        if (playbackState.value === 'playing') {
          playbackPosition.value += 1;
        }
      }, 1000);
    }

    onMounted(() => {
      if (getStoredToken()) {
        connectWs();
        fetchState();
        fetchQueue();
      }
      startPositionTicker();
    });

    onUnmounted(() => {
      if (ws) ws.close();
      if (positionInterval) clearInterval(positionInterval);
    });

    return {
      screen,
      pairingCode,
      pairing,
      pairError,
      playbackState,
      playbackPosition,
      currentTrack,
      trackDuration,
      queue,
      searchQuery,
      searching,
      searchResults,
      tabs,
      pair,
      command,
      seek,
      doSearch,
      playAlbum,
      viewArtist,
      formatTime,
    };
  },
}).mount('#app');
