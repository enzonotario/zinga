import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { computed, ref } from 'vue';

export interface YtmStatus {
  connected: boolean
  ytdlpVersion?: string | null
  browser?: string | null
}

export interface YtmArtistRef {
  id?: string | null
  name: string
}

export interface YtmAlbumRef {
  id?: string | null
  name: string
}

export interface YtmTrack {
  videoId: string
  title: string
  artists: YtmArtistRef[]
  album?: YtmAlbumRef | null
  durationSec?: number | null
  thumbnailUrl?: string | null
}

export interface YtmSearchAlbum {
  id: string
  title: string
  artists: YtmArtistRef[]
  year?: number | null
  thumbnailUrl?: string | null
}

export interface YtmSearchArtist {
  id: string
  name: string
  thumbnailUrl?: string | null
}

export interface YtmVideo {
  videoId: string
  title: string
  artists: YtmArtistRef[]
  views?: string | null
  durationSec?: number | null
  thumbnailUrl?: string | null
}

export interface YtmSearchResults {
  tracks: YtmTrack[]
  albums: YtmSearchAlbum[]
  artists: YtmSearchArtist[]
  videos: YtmVideo[]
}

export interface YtmVideoSection {
  title: string
  items: YtmVideo[]
}

export interface YtmAlbumTrack {
  videoId: string
  title: string
  artists: YtmArtistRef[]
  durationSec?: number | null
  trackNumber?: number | null
}

export interface YtmAlbumDetail {
  id: string
  title: string
  artists: YtmArtistRef[]
  year?: number | null
  thumbnailUrl?: string | null
  tracks: YtmAlbumTrack[]
}

export interface YtmArtistAlbum {
  id: string
  title: string
  year?: number | null
  thumbnailUrl?: string | null
}

export interface YtmArtistDetail {
  id: string
  name: string
  description?: string | null
  thumbnailUrl?: string | null
  albums: YtmArtistAlbum[]
  singles: YtmArtistAlbum[]
  topSongs: YtmTrack[]
  videos: YtmVideo[]
  videosPlaylistId?: string | null
  extraVideoSections: YtmVideoSection[]
}

export const YTM_BROWSERS = [
  'chrome',
  'chromium',
  'brave',
  'firefox',
  'edge',
  'opera',
  'vivaldi',
] as const;

export type YtmBrowser = (typeof YTM_BROWSERS)[number];

const status = ref<YtmStatus>({ connected: false, ytdlpVersion: null, browser: null });
const loading = ref(false);
const importing = ref(false);
const updating = ref(false);
const error = ref<string | null>(null);
const selectedBrowser = ref<YtmBrowser>('chrome');

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default function useYoutubeMusic() {
  const { t } = useI18n();

  const browserItems = computed(() => YTM_BROWSERS.map((browser) => ({
    label: t(`pages.settings.ytmBrowser.${browser}`),
    value: browser,
  })));

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      status.value = await invoke<YtmStatus>('ytm_status');
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function importFromBrowser(browser = selectedBrowser.value) {
    importing.value = true;
    error.value = null;
    try {
      status.value = await invoke<YtmStatus>('ytm_import_cookies', { browser });
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      importing.value = false;
    }
  }

  async function importFromFile() {
    importing.value = true;
    error.value = null;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'cookies.txt', extensions: ['txt'] }],
        title: t('pages.settings.ytmPickCookiesFile'),
      });
      if (!selected || Array.isArray(selected)) return;
      status.value = await invoke<YtmStatus>('ytm_import_cookies_file', { path: selected });
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      importing.value = false;
    }
  }

  async function logout() {
    importing.value = true;
    error.value = null;
    try {
      await invoke('ytm_logout');
      status.value = { ...status.value, connected: false, browser: null };
      await refresh();
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      importing.value = false;
    }
  }

  async function updateYtdlp() {
    updating.value = true;
    error.value = null;
    try {
      await invoke<string>('ytm_ytdlp_update');
      await refresh();
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      updating.value = false;
    }
  }

  async function search(query: string) {
    return invoke<YtmSearchResults>('ytm_search', { query });
  }

  async function getAlbum(id: string) {
    return invoke<YtmAlbumDetail>('ytm_get_album', { id });
  }

  async function getArtist(id: string) {
    return invoke<YtmArtistDetail>('ytm_get_artist', { id });
  }

  async function getPlaylistVideos(playlistId: string) {
    return invoke<YtmVideo[]>('ytm_get_playlist_videos', { playlistId });
  }

  return {
    status,
    loading,
    importing,
    updating,
    error,
    selectedBrowser,
    browserItems,
    refresh,
    importFromBrowser,
    importFromFile,
    logout,
    updateYtdlp,
    search,
    getAlbum,
    getArtist,
    getPlaylistVideos,
  };
}
