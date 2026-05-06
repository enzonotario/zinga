import type { Ref } from 'vue';

export type ProviderId = 'tidal' | 'spotify' | 'qobuz';
export interface DeviceLoginInfo {
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
}
export interface NormalizedArtist {
  id: string
  providerId: ProviderId
  name: string
  picture?: string
  biography?: string
  externalLinks?: { name: string, url: string }[]
  tidalUrl?: string
  popularity?: number
  addedAt?: string
}
export interface NormalizedAlbum {
  id: string
  providerId: ProviderId
  title: string
  artists: { id: string, name: string }[]
  coverUrl?: string
  releaseDate?: string
  numberOfTracks?: number
  numberOfVolumes?: number
  duration?: number
  type?: 'ALBUM' | 'EP' | 'SINGLE' | 'COMPILATION'
  explicit?: boolean
  mediaTags?: string[]
  audioQuality?: string
  copyright?: string
  barcodeId?: string
  label?: string
  genres?: string[]
  tidalUrl?: string
  popularity?: number
  availability?: string[]
  version?: string
  addedAt?: string
}
export interface NormalizedTrack {
  id: string
  providerId: ProviderId
  title: string
  artists: { id: string, name: string }[]
  duration?: number
  trackNumber?: number
  volumeNumber?: number
  explicit?: boolean
  isrc?: string
  copyright?: string
}
export interface NormalizedCredit {
  name: string
  role: string
}
export interface NormalizedSimilarArtist {
  id: string
  name: string
  picture?: string
}
export interface SearchResults {
  artists: NormalizedArtist[]
  albums: NormalizedAlbum[]
  tracks: NormalizedTrack[]
}
export interface MusicProvider {
  readonly id: ProviderId
  readonly name: string
  isInitialized: Ref<boolean>
  isUserLoggedIn: Ref<boolean>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  deviceLoginPending: Ref<boolean>
  deviceLoginInfo: Ref<DeviceLoginInfo | null>
  init: (force?: boolean) => Promise<void>
  startDeviceLogin: () => Promise<DeviceLoginInfo>
  completeDeviceLogin: () => Promise<boolean>
  cancelDeviceLogin: () => void
  logout: () => void
  searchAll: (query: string, limit?: number, countryCode?: string) => Promise<SearchResults>
  getArtist: (id: string, countryCode?: string) => Promise<NormalizedArtist>
  getArtistWithDetails: (id: string, countryCode?: string) => Promise<{
    artist: NormalizedArtist
    similarArtists: NormalizedSimilarArtist[]
  }>
  getAlbum: (id: string, countryCode?: string) => Promise<NormalizedAlbum>
  getAlbumTracks: (id: string, countryCode?: string) => Promise<NormalizedTrack[]>
  getAlbumsByArtist: (id: string, countryCode?: string) => Promise<NormalizedAlbum[]>
  getTrackCredits: (id: string, countryCode?: string) => Promise<NormalizedCredit[]>
  isAlbumFavorite: (id: string, countryCode?: string) => Promise<boolean>
  addAlbumToFavorites: (id: string, countryCode?: string) => Promise<void>
  removeAlbumFromFavorites: (id: string, countryCode?: string) => Promise<void>
  isArtistFollowed: (id: string, countryCode?: string) => Promise<boolean>
  followArtist: (id: string, countryCode?: string) => Promise<void>
  unfollowArtist: (id: string, countryCode?: string) => Promise<void>
  getFavoriteTrackIds: (countryCode?: string) => Promise<string[]>
  addTrackToFavorites: (id: string, countryCode?: string) => Promise<void>
  removeTrackFromFavorites: (id: string, countryCode?: string) => Promise<void>
  getFavoriteAlbums: (countryCode?: string, options?: { fetchAll?: boolean }) => Promise<NormalizedAlbum[]>
  getFavoriteAlbumsPage: (countryCode?: string, cursor?: string) => Promise<{ items: NormalizedAlbum[], nextCursor: string | null }>
  getFollowedArtists: (countryCode?: string, options?: { fetchAll?: boolean }) => Promise<NormalizedArtist[]>
  getFollowedArtistsPage: (countryCode?: string, cursor?: string) => Promise<{ items: NormalizedArtist[], nextCursor: string | null }>
  getArtistPicture: (id: string, countryCode?: string, minWidth?: number) => Promise<string | null>
  getAlbumCover: (id: string, countryCode?: string, minWidth?: number) => Promise<string | null>
  getAlbumProviders: (id: string, countryCode?: string) => Promise<any>
  clearCache: () => void
}
export interface ProviderRawData {
  raw: any
  included?: any[]
}
