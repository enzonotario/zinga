import { getCurrentProvider, getCurrentProviderId, setCurrentProvider } from '~/providers';

export default function useProvider() {
  const provider = getCurrentProvider();
  return {
    providerId: getCurrentProviderId(),
    providerName: provider.name,
    setProvider: setCurrentProvider,
    isInitialized: provider.isInitialized,
    isUserLoggedIn: provider.isUserLoggedIn,
    isLoading: provider.isLoading,
    error: provider.error,
    deviceLoginPending: provider.deviceLoginPending,
    deviceLoginInfo: provider.deviceLoginInfo,
    init: (force?: boolean) => provider.init(force),
    startDeviceLogin: () => provider.startDeviceLogin(),
    completeDeviceLogin: () => provider.completeDeviceLogin(),
    cancelDeviceLogin: () => provider.cancelDeviceLogin(),
    logout: () => provider.logout(),
    searchAll: (query: string, limit?: number, countryCode?: string) =>
      provider.searchAll(query, limit, countryCode),
    getArtist: (id: string, countryCode?: string) =>
      provider.getArtist(id, countryCode),
    getArtistWithDetails: (id: string, countryCode?: string) =>
      provider.getArtistWithDetails(id, countryCode),
    getAlbum: (id: string, countryCode?: string) =>
      provider.getAlbum(id, countryCode),
    getAlbumTracks: (id: string, countryCode?: string) =>
      provider.getAlbumTracks(id, countryCode),
    getAlbumsByArtist: (id: string, countryCode?: string) =>
      provider.getAlbumsByArtist(id, countryCode),
    getTrackCredits: (id: string, countryCode?: string) =>
      provider.getTrackCredits(id, countryCode),
    isAlbumFavorite: (id: string, countryCode?: string) =>
      provider.isAlbumFavorite(id, countryCode),
    addAlbumToFavorites: (id: string, countryCode?: string) =>
      provider.addAlbumToFavorites(id, countryCode),
    removeAlbumFromFavorites: (id: string, countryCode?: string) =>
      provider.removeAlbumFromFavorites(id, countryCode),
    isArtistFollowed: (id: string, countryCode?: string) =>
      provider.isArtistFollowed(id, countryCode),
    followArtist: (id: string, countryCode?: string) =>
      provider.followArtist(id, countryCode),
    unfollowArtist: (id: string, countryCode?: string) =>
      provider.unfollowArtist(id, countryCode),
    getFavoriteTrackIds: (countryCode?: string) =>
      provider.getFavoriteTrackIds(countryCode),
    addTrackToFavorites: (id: string, countryCode?: string) =>
      provider.addTrackToFavorites(id, countryCode),
    removeTrackFromFavorites: (id: string, countryCode?: string) =>
      provider.removeTrackFromFavorites(id, countryCode),
    getFavoriteAlbums: (countryCode?: string, options?: { fetchAll: boolean }) =>
      provider.getFavoriteAlbums(countryCode, options),
    getFavoriteAlbumsPage: (countryCode?: string, cursor?: string) =>
      provider.getFavoriteAlbumsPage(countryCode, cursor),
    getFollowedArtists: (countryCode?: string) =>
      provider.getFollowedArtists(countryCode),
    getFollowedArtistsPage: (countryCode?: string, cursor?: string) =>
      provider.getFollowedArtistsPage(countryCode, cursor),
    getAlbumProviders: (id: string, countryCode?: string) =>
      provider.getAlbumProviders(id, countryCode),
    getAlbumCover: (id: string, countryCode?: string, minWidth?: number) =>
      provider.getAlbumCover(id, countryCode, minWidth),
    clearCache: () => provider.clearCache(),
  };
}
