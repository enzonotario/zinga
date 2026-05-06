export interface TrackInfo {
  title: string
  artist: string
  album: string
  coverUrl?: string
  artistPicture?: string
  duration: number
  position: number
  uri?: string
  codec?: string
  audioFormat?: string
  date?: string
  trackNumber?: number
  streamServiceId?: string
  streamUrl?: string
  tidalUrls?: {
    artist?: string
    album?: string
    albumCredits?: string
  }
  tidalData?: {
    track?: any
    album?: any
    artist?: any
  }
}
