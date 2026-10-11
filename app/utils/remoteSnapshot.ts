import type { QueueItem } from './playQueue';
import { isQueueItem } from './playQueue';

export type RemotePlaybackStatus = 'playing' | 'paused' | 'stopped';

export const REMOTE_COVER_PATH = '/api/playback/cover'

export interface RemoteLyricsSnapshot {
  plain: string | null
  synced: string | null
}

export interface RemotePlaybackSnapshot {
  state: RemotePlaybackStatus
  position: number
  track: QueueItem | null
  coverUrl: string | null
  artistPicture: string | null
  coverPath: string | null
  lyrics: RemoteLyricsSnapshot | null
}

export interface RemotePlayback {
  state: RemotePlaybackStatus
  positionSec: number
  item: QueueItem | null
  coverUrl: string | null
  artistPicture: string | null
  coverPath: string | null
  lyrics: RemoteLyricsSnapshot | null
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

function toQueueItem(item: QueueItem): QueueItem {
  return { tlid: item.tlid, track: item.track };
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text || null
}

export function buildPlaybackSnapshot(
  state: RemotePlaybackStatus,
  positionSec: number,
  item: QueueItem | null | undefined,
  artwork?: { coverUrl?: string | null, artistPicture?: string | null },
  lyrics?: RemoteLyricsSnapshot | null,
): RemotePlaybackSnapshot {
  const coverUrl = artwork?.coverUrl || null
  const plain = cleanText(lyrics?.plain)
  const synced = cleanText(lyrics?.synced)
  return {
    state,
    position: Math.max(0, Math.round(positionSec * 1000)),
    track: item ? toQueueItem(item) : null,
    coverUrl,
    artistPicture: artwork?.artistPicture || null,
    coverPath: coverUrl ? REMOTE_COVER_PATH : null,
    lyrics: plain || synced ? { plain, synced } : null,
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
  if (!value || typeof value !== 'object') return null
  const plain = cleanText(typeof value.plain === 'string' ? value.plain : null)
  const synced = cleanText(typeof value.synced === 'string' ? value.synced : null)
  return plain || synced ? { plain, synced } : null
}

export function parsePlaybackSnapshot(data: any): RemotePlayback {
  const state = STATUSES.includes(data?.state) ? data.state : 'stopped';
  const position = Number(data?.position);
  const coverUrl = typeof data?.coverUrl === 'string' && data.coverUrl ? data.coverUrl : null
  const coverPath = typeof data?.coverPath === 'string' && data.coverPath.startsWith('/')
    ? data.coverPath
    : (coverUrl ? REMOTE_COVER_PATH : null)
  return {
    state,
    positionSec: Number.isFinite(position) && position > 0 ? position / 1000 : 0,
    item: isQueueItem(data?.track) ? data.track : null,
    coverUrl,
    artistPicture: typeof data?.artistPicture === 'string' && data.artistPicture ? data.artistPicture : null,
    coverPath,
    lyrics: parseLyrics(data?.lyrics),
  };
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
