import type { QueueItem } from './playQueue';
import { isQueueItem } from './playQueue';

export type RemotePlaybackStatus = 'playing' | 'paused' | 'stopped';

export interface RemotePlaybackSnapshot {
  state: RemotePlaybackStatus
  position: number
  track: QueueItem | null
  coverUrl: string | null
  artistPicture: string | null
}

export interface RemotePlayback {
  state: RemotePlaybackStatus
  positionSec: number
  item: QueueItem | null
  coverUrl: string | null
  artistPicture: string | null
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

export function buildPlaybackSnapshot(
  state: RemotePlaybackStatus,
  positionSec: number,
  item: QueueItem | null | undefined,
  artwork?: { coverUrl?: string | null, artistPicture?: string | null },
): RemotePlaybackSnapshot {
  return {
    state,
    position: Math.max(0, Math.round(positionSec * 1000)),
    track: item ? toQueueItem(item) : null,
    coverUrl: artwork?.coverUrl || null,
    artistPicture: artwork?.artistPicture || null,
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

export function parsePlaybackSnapshot(data: any): RemotePlayback {
  const state = STATUSES.includes(data?.state) ? data.state : 'stopped';
  const position = Number(data?.position);
  return {
    state,
    positionSec: Number.isFinite(position) && position > 0 ? position / 1000 : 0,
    item: isQueueItem(data?.track) ? data.track : null,
    coverUrl: typeof data?.coverUrl === 'string' && data.coverUrl ? data.coverUrl : null,
    artistPicture: typeof data?.artistPicture === 'string' && data.artistPicture ? data.artistPicture : null,
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
