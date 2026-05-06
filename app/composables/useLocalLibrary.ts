import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';
import useLocalDb from './useLocalDb';

export interface LocalFolder {
  id: number
  path: string
  addedAt: number
}

export interface LocalTrack {
  id?: number
  uri: string
  path: string
  title: string
  artist: string
  album: string
  duration: number
  folderId?: number
  cover?: string
}

export default function useLocalLibrary() {
  const { getDb } = useLocalDb();
  const folders = ref<LocalFolder[]>([]);
  const tracks = ref<LocalTrack[]>([]);
  const scanning = ref(false);

  async function loadFolders() {
    const database = await getDb();
    const result = await database.select<any[]>('SELECT id, path, added_at as addedAt FROM local_folders');
    folders.value = result;
  }

  async function loadTracks() {
    const database = await getDb();
    const result = await database.select<LocalTrack[]>('SELECT * FROM local_tracks ORDER BY path ASC');
    tracks.value = result;
  }

  async function addFolder(path: string) {
    const database = await getDb();
    const now = Date.now();
    try {
      await database.execute('INSERT INTO local_folders (path, added_at) VALUES ($1, $2)', [path, now]);
      await loadFolders();
      await scanFolder(path);
    } catch (err) {
      console.error('Error adding folder:', err);
      throw err;
    }
  }

  async function removeFolder(id: number) {
    const database = await getDb();
    await database.execute('DELETE FROM local_folders WHERE id = $1', [id]);
    await loadFolders();
    await loadTracks();
  }

  async function scanFolder(path: string) {
    scanning.value = true;
    try {
      const database = await getDb();
      const folder = (await database.select<any[]>('SELECT id FROM local_folders WHERE path = $1', [path]))[0];
      if (!folder) return;

      const scannedTracks = await invoke<LocalTrack[]>('scan_folder', { path });

      for (const track of scannedTracks) {
        await database.execute(
          `INSERT OR REPLACE INTO local_tracks 
          (uri, path, title, artist, album, duration, folder_id, cover) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [track.uri, track.path, track.title, track.artist, track.album, track.duration, folder.id, track.cover],
        );
      }
      await loadTracks();
    } catch (err) {
      console.error('Error scanning folder:', err);
    } finally {
      scanning.value = false;
    }
  }

  async function refreshLibrary() {
    await loadFolders();
    for (const folder of folders.value) {
      await scanFolder(folder.path);
    }
  }

  return {
    folders,
    tracks,
    scanning,
    loadFolders,
    loadTracks,
    addFolder,
    removeFolder,
    refreshLibrary,
  };
}
