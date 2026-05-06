import { getCurrentProvider } from '~/providers';

export default function useProviderArtwork() {
  const provider = getCurrentProvider();
  return {
    getArtistPicture: (id: string, countryCode = 'US', minWidth = 640) =>
      provider.getArtistPicture(id, countryCode, minWidth),
    getAlbumCover: (id: string, countryCode = 'US', minWidth = 640) =>
      provider.getAlbumCover(id, countryCode, minWidth),
  };
}
