import type { YtmSearchResults } from '~/composables/useYoutubeMusic';
import type { SearchResults } from '~/providers/types';

export type SearchSourceFilter = 'all' | 'tidal' | 'ytm';

export function emptyTidalSearchResults(): SearchResults {
  return { artists: [], albums: [], tracks: [] };
}

export function emptyYtmSearchResults(): YtmSearchResults {
  return { tracks: [], albums: [], artists: [], videos: [] };
}

export function tidalResultCount(results: SearchResults) {
  return results.artists.length + results.albums.length + results.tracks.length;
}

export function ytmResultCount(results: YtmSearchResults) {
  return results.artists.length + results.albums.length + results.tracks.length + results.videos.length;
}

export function hasUnifiedResults(
  tidal: SearchResults,
  ytm: YtmSearchResults,
  source: SearchSourceFilter = 'all',
) {
  if (source === 'tidal') return tidalResultCount(tidal) > 0;
  if (source === 'ytm') return ytmResultCount(ytm) > 0;
  return tidalResultCount(tidal) > 0 || ytmResultCount(ytm) > 0;
}

export function showTidalResults(source: SearchSourceFilter) {
  return source === 'all' || source === 'tidal';
}

export function showYtmResults(source: SearchSourceFilter) {
  return source === 'all' || source === 'ytm';
}
