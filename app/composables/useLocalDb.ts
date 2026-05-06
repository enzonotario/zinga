import type { NormalizedAlbum, NormalizedArtist } from '~/providers/types';
import Database from '@tauri-apps/plugin-sql';
import { mapDbAlbumToNormalized, mapDbArtistToNormalized } from '~/utils/dbConverters';

interface DbAlbum {
  id: string
  provider_id: string
  title: string
  cover_url: string | null
  release_date: string | null
  number_of_tracks: number | null
  number_of_volumes: number | null
  duration: number | null
  type: string | null
  explicit: number
  media_tags: string | null
  audio_quality: string | null
  copyright: string | null
  barcode_id: string | null
  label: string | null
  genres: string | null
  tidal_url: string | null
  popularity: number | null
  availability: string | null
  version: string | null
  added_at: string | null
  synced_at: number
  created_at: number
}
interface DbArtist {
  id: string
  provider_id: string
  name: string
  picture: string | null
  biography: string | null
  external_links: string | null
  tidal_url: string | null
  popularity: number | null
  added_at: string | null
  synced_at: number
  created_at: number
}
interface DbAlbumArtist {
  album_id: string
  artist_id: string
  artist_name: string
}
interface SyncHistory {
  id: number
  sync_type: string
  started_at: number
  completed_at: number | null
  items_synced: number
  status: string
}
let db: Database | null = null;
async function getDb(): Promise<Database> {
  if (!db) db = await Database.load('sqlite:zinga.db');
  return db;
}
export default function useLocalDb() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  async function saveAlbum(album: NormalizedAlbum): Promise<void> {
    const database = await getDb();
    const now = Date.now();
    await database.execute(
      `INSERT OR REPLACE INTO albums (
        id, provider_id, title, cover_url, release_date, number_of_tracks, number_of_volumes,
        duration, type, explicit, media_tags, audio_quality, copyright,
        barcode_id, label, genres, tidal_url, popularity, availability, version,
        added_at, synced_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        COALESCE((SELECT created_at FROM albums WHERE id = $1), $23))`,
      [
        album.id,
        album.providerId,
        album.title,
        album.coverUrl || null,
        album.releaseDate || null,
        album.numberOfTracks || null,
        album.numberOfVolumes || null,
        album.duration || null,
        album.type || null,
        album.explicit ? 1 : 0,
        album.mediaTags ? JSON.stringify(album.mediaTags) : null,
        album.audioQuality || null,
        album.copyright || null,
        album.barcodeId || null,
        album.label || null,
        album.genres ? JSON.stringify(album.genres) : null,
        album.tidalUrl || null,
        album.popularity || null,
        album.availability ? JSON.stringify(album.availability) : null,
        album.version || null,
        album.addedAt || null,
        now,
        now,
      ],
    );
    await database.execute('DELETE FROM album_artists WHERE album_id = $1', [album.id]);
    for (const artist of album.artists) {
      await database.execute(
        'INSERT OR REPLACE INTO album_artists (album_id, artist_id, artist_name) VALUES ($1, $2, $3)',
        [album.id, artist.id, artist.name],
      );
    }
  }
  async function saveArtist(artist: NormalizedArtist): Promise<void> {
    const database = await getDb();
    const now = Date.now();
    await database.execute(
      `INSERT OR REPLACE INTO artists (
        id, provider_id, name, picture, biography, external_links,
        tidal_url, popularity, added_at, synced_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        COALESCE((SELECT created_at FROM artists WHERE id = $1), $11))`,
      [
        artist.id,
        artist.providerId,
        artist.name,
        artist.picture || null,
        artist.biography || null,
        artist.externalLinks ? JSON.stringify(artist.externalLinks) : null,
        artist.tidalUrl || null,
        artist.popularity || null,
        artist.addedAt || null,
        now,
        now,
      ],
    );
  }
  async function getAlbums(): Promise<NormalizedAlbum[]> {
    const database = await getDb();
    const albums = await database.select<DbAlbum[]>('SELECT * FROM albums ORDER BY added_at DESC, release_date DESC');
    const albumArtists = await database.select<DbAlbumArtist[]>('SELECT * FROM album_artists');
    const artistsByAlbum = albumArtists.reduce((acc, aa) => {
      if (!acc[aa.album_id]) acc[aa.album_id] = [];
      acc[aa.album_id].push({ id: aa.artist_id, name: aa.artist_name });
      return acc;
    }, {} as Record<string, { id: string, name: string }[]>);
    return albums.map((album) => mapDbAlbumToNormalized(album, artistsByAlbum[album.id] || []));
  }
  async function getArtists(): Promise<NormalizedArtist[]> {
    const database = await getDb();
    const artists = await database.select<DbArtist[]>('SELECT * FROM artists ORDER BY name ASC');
    return artists.map(mapDbArtistToNormalized);
  }
  async function getAlbumCount(): Promise<number> {
    const database = await getDb();
    const result = await database.select<{ count: number }[]>('SELECT COUNT(*) as count FROM albums');
    return result[0]?.count || 0;
  }
  async function getArtistCount(): Promise<number> {
    const database = await getDb();
    const result = await database.select<{ count: number }[]>('SELECT COUNT(*) as count FROM artists');
    return result[0]?.count || 0;
  }
  async function startSyncHistory(syncType: string): Promise<number> {
    const database = await getDb();
    const result = await database.execute(
      'INSERT INTO sync_history (sync_type, started_at, status) VALUES ($1, $2, $3)',
      [syncType, Date.now(), 'in_progress'],
    );
    return result.lastInsertId;
  }
  async function completeSyncHistory(id: number, itemsSynced: number, status: string): Promise<void> {
    const database = await getDb();
    await database.execute(
      'UPDATE sync_history SET completed_at = $1, items_synced = $2, status = $3 WHERE id = $4',
      [Date.now(), itemsSynced, status, id],
    );
  }
  async function getLastSync(syncType: string): Promise<SyncHistory | null> {
    const database = await getDb();
    const result = await database.select<SyncHistory[]>(
      'SELECT * FROM sync_history WHERE sync_type = $1 ORDER BY started_at DESC LIMIT 1',
      [syncType],
    );
    return result[0] || null;
  }
  async function getAlbumsByQuery(query: string, params: any[]): Promise<NormalizedAlbum[]> {
    const database = await getDb();
    const albums = await database.select<DbAlbum[]>(query, params);
    if (albums.length === 0) return [];
    const albumIds = albums.map((a) => a.id);
    const albumArtists = await database.select<DbAlbumArtist[]>(
      `SELECT * FROM album_artists WHERE album_id IN (${albumIds.map(() => '?').join(',')})`,
      albumIds,
    );
    const artistsByAlbum = albumArtists.reduce((acc, aa) => {
      if (!acc[aa.album_id]) acc[aa.album_id] = [];
      acc[aa.album_id].push({ id: aa.artist_id, name: aa.artist_name });
      return acc;
    }, {} as Record<string, { id: string, name: string }[]>);
    return albums.map((album) => mapDbAlbumToNormalized(album, artistsByAlbum[album.id] || []));
  }
  async function getAlbumsByGenre(genre: string): Promise<NormalizedAlbum[]> {
    return getAlbumsByQuery('SELECT * FROM albums WHERE genres LIKE $1 ORDER BY added_at DESC, release_date DESC', [`%${genre}%`]);
  }
  async function getAlbumsByYear(year: number): Promise<NormalizedAlbum[]> {
    return getAlbumsByQuery('SELECT * FROM albums WHERE release_date LIKE $1 ORDER BY added_at DESC, release_date DESC', [`${year}%`]);
  }
  async function getStats(): Promise<any> {
    const database = await getDb();
    const [totalAlbums, totalArtists, typeStats, yearStats, albums, popularityResult, recentResult] = await Promise.all([
      getAlbumCount(),
      getArtistCount(),
      database.select<{ type: string, count: number }[]>('SELECT type, COUNT(*) as count FROM albums GROUP BY type ORDER BY count DESC'),
      database.select<{ year: string, count: number }[]>('SELECT substr(release_date, 1, 4) as year, COUNT(*) as count FROM albums WHERE release_date IS NOT NULL GROUP BY year ORDER BY year DESC'),
      database.select<{ genres: string }[]>('SELECT genres FROM albums WHERE genres IS NOT NULL'),
      database.select<{ avg: number }[]>('SELECT AVG(popularity) as avg FROM albums WHERE popularity IS NOT NULL'),
      database.select<{ count: number }[]>('SELECT COUNT(*) as count FROM albums WHERE added_at >= $1', [(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString()]),
    ]);
    const genreCounts: Record<string, number> = {};
    for (const album of albums) {
      const genres = JSON.parse(album.genres) as string[];
      for (const genre of genres) genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
    return {
      totalAlbums,
      totalArtists,
      albumsByType: typeStats.reduce((acc, t) => {
        acc[t.type || 'UNKNOWN'] = t.count;
        return acc;
      }, {} as Record<string, number>),
      albumsByYear: yearStats.reduce((acc, y) => {
        const year = Number.parseInt(y.year);
        if (!Number.isNaN(year)) {
          acc[year] = y.count;
        }
        return acc;
      }, {} as Record<number, number>),
      topGenres: Object.entries(genreCounts).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      avgPopularity: popularityResult[0]?.avg || 0,
      recentlyAdded: recentResult[0]?.count || 0,
    };
  }
  async function clearAllData(): Promise<void> {
    const database = await getDb();
    await Promise.all([
      database.execute('DELETE FROM album_artists'),
      database.execute('DELETE FROM albums'),
      database.execute('DELETE FROM artists'),
      database.execute('DELETE FROM sync_history'),
    ]);
  }
  return {
    getDb,
    isLoading,
    error,
    saveAlbum,
    saveArtist,
    getAlbums,
    getArtists,
    getAlbumCount,
    getArtistCount,
    startSyncHistory,
    completeSyncHistory,
    getLastSync,
    getAlbumsByGenre,
    getAlbumsByYear,
    getStats,
    clearAllData,
  };
}
