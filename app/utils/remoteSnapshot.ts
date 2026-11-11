import type { QueueItem, QueueTrack } from './playQueue';
import { extractTidalIdsFromUri } from '~/providers/tidal/utils';
import { isQueueItem } from './playQueue';

export type RemotePlaybackStatus = 'playing' | 'paused' | 'stopped';

export const REMOTE_COVER_PATH = '/api/playback/cover';

export type RemoteLyricsStatus = 'loading' | 'missing';

export interface RemoteLyricsSnapshot {
  plain: string | null
  synced: string | null
  status?: RemoteLyricsStatus
}

export interface RemoteLyricsView {
  loading: boolean
  missing: boolean
  plain: string | null
  synced: string | null
}

export interface RemoteCreditGroup {
  role: string
  names: string[]
}

export type RemoteProviderKind = 'tidal' | 'ytm';

export interface RemoteNavigation {
  provider: RemoteProviderKind | null
  albumId: string | null
  artistIds: string[]
}

export interface RemotePlaybackSnapshot {
  state: RemotePlaybackStatus
  position: number
  track: QueueItem | null
  coverUrl: string | null
  artistPicture: string | null
  coverPath: string | null
  lyrics: RemoteLyricsSnapshot | null
  credits: RemoteCreditGroup[] | null
  hasQueue: boolean
  pauseAtEnd: boolean
  provider: RemoteProviderKind | null
  albumId: string | null
  artistIds: string[]
}

export interface RemotePlayback {
  state: RemotePlaybackStatus
  positionSec: number
  item: QueueItem | null
  coverUrl: string | null
  artistPicture: string | null
  coverPath: string | null
  lyrics: RemoteLyricsSnapshot | null
  credits: RemoteCreditGroup[] | null
  pauseAtEnd: boolean
  navigation: RemoteNavigation
}

export interface RemoteDevice {
  id: string
  name: string
  manufacturer?: string
  modelName?: string
}

export interface RemoteDevicesSnapshot {
  devices: RemoteDevice[]
  selectedDeviceId: string | null
  volume: number | null
}

const STATUSES: RemotePlaybackStatus[] = ['playing', 'paused', 'stopped'];
const NAV_ID_PATTERN = /^[\w-]+$/;
const YTM_ALBUM_PREFIX = 'ytm:album:';

function toQueueItem(item: QueueItem): QueueItem {
  return { tlid: item.tlid, track: item.track };
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

export function groupRemoteCredits(credits: { role?: string | null, name?: string | null }[] | null | undefined): RemoteCreditGroup[] {
  return normalizeCreditGroups((credits ?? []).map((credit) => ({
    role: credit.role ?? '',
    names: credit.name ? [credit.name] : [],
  })));
}

function normalizeCreditGroups(credits?: { role?: string | null, names?: (string | null)[] | null }[] | null): RemoteCreditGroup[] {
  const grouped: RemoteCreditGroup[] = [];
  for (const credit of credits ?? []) {
    const role = cleanText(credit.role);
    if (!role) continue;
    for (const rawName of credit.names ?? []) {
      const name = cleanText(rawName);
      if (!name) continue;
      const existing = grouped.find((group) => group.role === role);
      if (!existing) grouped.push({ role, names: [name] });
      else if (!existing.names.includes(name)) existing.names.push(name);
    }
  }
  return grouped.slice(0, 12);
}

function emptyNavigation(): RemoteNavigation {
  return { provider: null, albumId: null, artistIds: [] };
}

function navId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value).trim();
  return NAV_ID_PATTERN.test(id) ? id : null;
}

function uniqueNavIds(values: unknown[]): string[] {
  return [...new Set(values.map(navId).filter((id): id is string => id != null))];
}

function trackProvider(uri?: string): RemoteProviderKind | null {
  if (uri?.startsWith('tidal:track:')) return 'tidal';
  if (uri?.startsWith('ytm:track:')) return 'ytm';
  return null;
}

export function buildPlaybackNavigation(track: QueueTrack | null | undefined, tidalData?: any): RemoteNavigation {
  const provider = trackProvider(track?.uri);
  if (!track || !provider) return emptyNavigation();
  if (provider === 'ytm') {
    const albumUri = track.album?.uri;
    const albumId = albumUri?.startsWith(YTM_ALBUM_PREFIX) ? navId(albumUri.slice(YTM_ALBUM_PREFIX.length)) : null;
    return { provider, albumId, artistIds: [] };
  }
  const data = tidalData?.uri === track.uri ? tidalData : null;
  const uriIds = extractTidalIdsFromUri(track.uri);
  const relationships = data?.track?.relationships;
  const relatedArtists: any[] = Array.isArray(relationships?.artists?.data) ? relationships.artists.data : [];
  return {
    provider,
    albumId: navId(data?.album?.data?.id ?? data?.album?.id ?? relationships?.albums?.data?.[0]?.id ?? uriIds.albumId),
    artistIds: uniqueNavIds([
      data?.artist?.data?.id ?? data?.artist?.id,
      ...relatedArtists.map((artist) => artist?.id),
      uriIds.artistId,
    ]),
  };
}

export function remoteNavigationRoutes(navigation: RemoteNavigation) {
  const prefix = navigation.provider === 'ytm' ? '/ytm' : '';
  const artistId = navigation.artistIds[0];
  return {
    albumRoute: navigation.provider && navigation.albumId ? `${prefix}/album/${navigation.albumId}` : null,
    artistRoute: navigation.provider && artistId ? `${prefix}/artist/${artistId}` : null,
  };
}

export function buildPlaybackSnapshot(
  state: RemotePlaybackStatus,
  positionSec: number,
  item: QueueItem | null | undefined,
  artwork?: { coverUrl?: string | null, artistPicture?: string | null },
  lyrics?: RemoteLyricsSnapshot | null,
  credits?: RemoteCreditGroup[] | null,
  hasQueue = false,
  pauseAtEnd = false,
  navigation?: RemoteNavigation | null,
): RemotePlaybackSnapshot {
  const nav = navigation ?? emptyNavigation();
  const coverUrl = artwork?.coverUrl || null;
  const plain = cleanText(lyrics?.plain);
  const synced = cleanText(lyrics?.synced);
  const grouped = normalizeCreditGroups(credits);
  let lyricsSnapshot: RemoteLyricsSnapshot | null = null;
  if (plain || synced) lyricsSnapshot = { plain, synced };
  else if (lyrics?.status === 'loading' || lyrics?.status === 'missing') {
    lyricsSnapshot = { plain: null, synced: null, status: lyrics.status };
  }
  return {
    state,
    position: Math.max(0, Math.round(positionSec * 1000)),
    track: item ? toQueueItem(item) : null,
    coverUrl,
    artistPicture: artwork?.artistPicture || null,
    coverPath: coverUrl ? REMOTE_COVER_PATH : null,
    lyrics: lyricsSnapshot,
    credits: grouped.length ? grouped : null,
    hasQueue,
    pauseAtEnd,
    provider: nav.provider,
    albumId: nav.albumId,
    artistIds: [...nav.artistIds],
  };
}

export function buildDevicesSnapshot(
  devices: RemoteDevice[],
  selectedDeviceId: string | null,
  volume: number | null,
): RemoteDevicesSnapshot {
  return {
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      manufacturer: device.manufacturer,
      modelName: device.modelName,
    })),
    selectedDeviceId,
    volume,
  };
}

export function buildQueueSnapshot(items: QueueItem[]): QueueItem[] {
  return items.map(toQueueItem);
}

function parseLyrics(value: any): RemoteLyricsSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const plain = cleanText(typeof value.plain === 'string' ? value.plain : null);
  const synced = cleanText(typeof value.synced === 'string' ? value.synced : null);
  const status = value.status === 'loading' || value.status === 'missing' ? value.status : undefined;
  if (plain || synced) return { plain, synced };
  if (!status) return null;
  return { plain: null, synced: null, status };
}

export function remoteLyricsView(lyrics: RemoteLyricsSnapshot | null, hasTrack: boolean): RemoteLyricsView {
  const plain = lyrics?.plain ?? null;
  const synced = lyrics?.synced ?? null;
  if (plain || synced) return { loading: false, missing: false, plain, synced };
  if (!hasTrack) return { loading: false, missing: false, plain: null, synced: null };
  if (lyrics?.status === 'loading') return { loading: true, missing: false, plain: null, synced: null };
  return { loading: false, missing: true, plain: null, synced: null };
}

export function parsePlaybackSnapshot(data: any): RemotePlayback {
  const state = STATUSES.includes(data?.state) ? data.state : 'stopped';
  const position = Number(data?.position);
  const coverUrl = typeof data?.coverUrl === 'string' && data.coverUrl ? data.coverUrl : null;
  const coverPath = typeof data?.coverPath === 'string' && data.coverPath.startsWith('/')
    ? data.coverPath
    : (coverUrl ? REMOTE_COVER_PATH : null);
  return {
    state,
    positionSec: Number.isFinite(position) && position > 0 ? position / 1000 : 0,
    item: isQueueItem(data?.track) ? data.track : null,
    coverUrl,
    artistPicture: typeof data?.artistPicture === 'string' && data.artistPicture ? data.artistPicture : null,
    coverPath,
    lyrics: parseLyrics(data?.lyrics),
    credits: parseCredits(data?.credits),
    pauseAtEnd: data?.pauseAtEnd === true,
    navigation: parseNavigation(data),
  };
}

function parseNavigation(data: any): RemoteNavigation {
  const provider: RemoteProviderKind | null = data?.provider === 'tidal' || data?.provider === 'ytm' ? data.provider : null;
  if (!provider) return emptyNavigation();
  return {
    provider,
    albumId: navId(data?.albumId),
    artistIds: Array.isArray(data?.artistIds) ? uniqueNavIds(data.artistIds) : [],
  };
}

function parseCredits(value: any): RemoteCreditGroup[] | null {
  if (!Array.isArray(value)) return null;
  const grouped = groupRemoteCredits(value.flatMap((row) => {
    const role = typeof row?.role === 'string' ? row.role : '';
    const names = Array.isArray(row?.names) ? row.names : [];
    return names.map((name: unknown) => ({ role, name: typeof name === 'string' ? name : '' }));
  }));
  return grouped.length ? grouped : null;
}

export function parseDevicesSnapshot(data: any): RemoteDevicesSnapshot {
  const devices = Array.isArray(data?.devices)
    ? data.devices.flatMap((device: any) => {
        if (typeof device?.id !== 'string' || typeof device?.name !== 'string') return [];
        return [{
          id: device.id,
          name: device.name,
          manufacturer: typeof device.manufacturer === 'string' ? device.manufacturer : undefined,
          modelName: typeof device.modelName === 'string' ? device.modelName : undefined,
        }];
      })
    : [];
  const selectedDeviceId = data?.selectedDeviceId;
  return {
    devices,
    selectedDeviceId: typeof selectedDeviceId === 'string' ? selectedDeviceId : null,
    volume: typeof data?.volume === 'number' && Number.isFinite(data.volume) ? data.volume : null,
  };
}

export function parseQueueSnapshot(data: any): QueueItem[] {
  const tracks = Array.isArray(data) ? data : data?.tracks;
  return Array.isArray(tracks) ? tracks.filter(isQueueItem) : [];
}
