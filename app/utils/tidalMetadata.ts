import { getTidalTrackInfo } from '~/utils/tidal';

export async function fetchTidalMetadata(uri: string, tidalArtwork: any, tidalAuth: any) {
  try {
    const tidalData = await getTidalTrackInfo(uri, 'US', tidalAuth);
    if (!tidalData) return null;
    let coverUrl = null;
    let artistPictureUrl = null;
    let albumData = null;
    let artistData = null;
    if (tidalData.album) {
      if (tidalData.album.data && tidalData.album.included) {
        albumData = tidalData.album;
        const albumWithIncluded = {
          ...tidalData.album.data,
          included: tidalData.album.included || [],
        };
        let albumCoverUrl = tidalArtwork.getArtworkUrl(albumWithIncluded, 640);
        if (!albumCoverUrl && tidalData.album.data.id) {
          try {
            albumCoverUrl = await tidalArtwork.getAlbumCover(null, tidalData.album.data.id);
            if (albumCoverUrl) {
              coverUrl = albumCoverUrl;
            }
          } catch (error) {
            console.error('Error obteniendo portada del álbum:', error);
          }
        } else if (albumCoverUrl) {
          coverUrl = albumCoverUrl;
        }
      } else if (tidalData.album.included) {
        const albumCoverUrl = tidalArtwork.getArtworkUrl(tidalData.album, 640);
        if (albumCoverUrl) {
          coverUrl = albumCoverUrl;
        }
      }
    }
    if (tidalData.artist) {
      if (tidalData.artist.data && tidalData.artist.included) {
        artistData = tidalData.artist;
        const artistWithIncluded = {
          ...tidalData.artist.data,
          included: tidalData.artist.included || [],
        };
        let artistPic = tidalArtwork.getArtworkUrl(artistWithIncluded, 320);
        if (!artistPic && tidalData.artist.data.id) {
          try {
            artistPic = await tidalArtwork.getArtistPicture(null, tidalData.artist.data.id);
            if (artistPic) {
              artistPictureUrl = artistPic;
            }
          } catch (error) {
            console.error('Error obteniendo imagen del artista:', error);
          }
        } else if (artistPic) {
          artistPictureUrl = artistPic;
        }
      } else if (tidalData.artist.included) {
        const artistPic = tidalArtwork.getArtworkUrl(tidalData.artist, 320);
        if (artistPic) {
          artistPictureUrl = artistPic;
        }
      } else if (tidalData.artist.data?.id) {
        try {
          const artistPic = await tidalArtwork.getArtistPicture(null, tidalData.artist.data.id);
          if (artistPic) {
            artistPictureUrl = artistPic;
          }
        } catch (error) {
          console.error('Error obteniendo imagen del artista:', error);
        }
      }
    } else if (tidalData.track) {
      const trackData = tidalData.track.data || tidalData.track;
      const trackIncluded = tidalData.track.included || [];
      const artistRef = trackData.relationships?.artists?.data?.[0];
      if (artistRef) {
        const artistIncluded = trackIncluded.find(
          (item: any) => item.type === 'artists' && item.id === artistRef.id,
        );
        if (artistIncluded) {
          artistData = {
            data: artistIncluded,
            included: trackIncluded,
          };
          const artistWithIncluded = {
            ...artistIncluded,
            included: trackIncluded,
          };
          let artistPic = tidalArtwork.getArtworkUrl(artistWithIncluded, 320);
          if (!artistPic && artistRef.id) {
            try {
              artistPic = await tidalArtwork.getArtistPicture(null, artistRef.id);
              if (artistPic) {
                artistPictureUrl = artistPic;
              }
            } catch (error) {
              console.error('Error obteniendo imagen del artista:', error);
            }
          } else if (artistPic) {
            artistPictureUrl = artistPic;
          }
        } else if (artistRef.id) {
          try {
            const artistResult = await tidalAuth.getArtist(artistRef.id, 'US', ['profileArt']);
            if (artistResult?.data) {
              artistData = {
                data: artistResult.data,
                included: [...trackIncluded, ...(artistResult.included || [])],
              };
            }
            const artistPic = await tidalArtwork.getArtistPicture(null, artistRef.id);
            if (artistPic) {
              artistPictureUrl = artistPic;
            }
          } catch (error) {
            console.error('Error obteniendo imagen del artista:', error);
          }
        }
      }
    }
    return {
      uri,
      track: tidalData.track
        ? (tidalData.track.data
            ? {
                ...tidalData.track.data,
                included: tidalData.track.included || [],
              }
            : {
                ...tidalData.track,
                included: tidalData.track.included || [],
              })
        : undefined,
      album: albumData || (tidalData.album?.data && tidalData.album?.included
        ? tidalData.album
        : tidalData.album?.included
          ? tidalData.album
          : tidalData.album),
      artist: artistData || (tidalData.artist?.data && tidalData.artist?.included
        ? tidalData.artist
        : tidalData.artist?.included
          ? tidalData.artist
          : tidalData.artist),
      coverUrl,
      artistPicture: artistPictureUrl,
    };
  } catch (error) {
    console.error('Error obteniendo datos de TIDAL para Mopidy:', error);
    return null;
  }
}
