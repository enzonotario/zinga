export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'buffering' | 'error';
export interface Track {
  id: string
  uri: string
  title: string
  artist: string
  album: string
  duration: number
  artworkUrl?: string
}
export interface PlaybackStatus {
  state: PlaybackState
  position: number
  duration: number
  track: Track | null
  volume: number
  isMuted: boolean
}
export type PlaybackMode = 'local' | 'upnp';
export interface PlaybackEngine {
  name: string
  init: () => Promise<void>
  play: (track: Track) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  seek: (position: number) => Promise<void>
  setVolume: (volume: number) => Promise<void>
  destroy: () => Promise<void>
}
