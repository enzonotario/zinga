import configparser
import json
import pathlib
import sys

import tidalapi

DATA_DIR = pathlib.Path.home() / '.local/share/mopidy/tidal'
CONFIG_FILE = pathlib.Path.home() / '.config/mopidy/mopidy.conf'


def load_session():
    session = tidalapi.Session()
    for name in ('tidal-pkce.json', 'tidal-oauth.json'):
        path = DATA_DIR / name
        if path.exists() and session.load_session_from_file(path):
            return session
    sys.exit('No TIDAL session found')


def configured_quality():
    config = configparser.ConfigParser()
    config.read(CONFIG_FILE)
    return config.get('tidal', 'quality', fallback='LOSSLESS')


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        sys.exit('Usage: tidal_manifest.py <trackId>')
    session = load_session()
    session.config.quality = configured_quality()
    stream = session.track(int(sys.argv[1])).get_stream()
    if 'dash' in stream.manifest_mime_type:
        print(json.dumps({'kind': 'mpd', 'data': stream.get_manifest_data()}))
        return
    print(json.dumps({'kind': 'url', 'data': stream.get_stream_manifest().get_urls()[0]}))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as err:
        sys.exit(f'{type(err).__name__}: {err}')
