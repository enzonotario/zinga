export interface TrackInfo {
  title: string
  artist: string
  album: string
  coverUrl?: string
  artistPicture?: string
  duration: number
  position: number
  uri?: string
  date?: string
  trackNumber?: number
  tidalData?: {
    track?: any
    album?: any
    artist?: any
  }
}
