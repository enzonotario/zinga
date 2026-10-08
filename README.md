# Zinga

Music app for UPnP devices, built with Nuxt 4 and Tauri 2.

![Zinga screenshot](https://zinga.enzonotario.me/assets/zinga-screenshot.png)

> This project is still under active development.  
> Please report any issues, suggestions, or unexpected behavior.

## Features

- Play music on UPnP devices
- TIDAL integration
- Focus on displaying rich track and album credits

## Platform Status

Zinga is currently focused on and tested on Linux.

Contributions for Windows, macOS, and Android support are welcome.

## Architecture

TIDAL tracks are resolved through an in-app TIDAL session (Settings > Playback). A built-in stream server (port `9633`) remuxes or transcodes TIDAL and local files with `ffmpeg` and serves them as FLAC (or MP3 fallback) to UPnP renderers, which pull the audio from it. Local playback on this device runs in-process with GStreamer. The queue, playback state and remote control live in the app itself; no external music server is needed.

## Runtime Requirements

- `ffmpeg` on `PATH`
- GStreamer plugins: `playbin`, `autoaudiosink` (gst-plugins-base), `souphttpsrc`, `flacparse`, `flacdec` (gst-plugins-good)

On Debian/Ubuntu:

```bash
sudo apt install ffmpeg gstreamer1.0-plugins-good gstreamer1.0-plugins-base
```

The app checks these on startup and opens the system check page if something is missing.

### Upgrading from older versions

Older versions installed a Mopidy + Icecast + PulseAudio pipeline that is no longer used. You can remove it manually. It consisted of:

- Mopidy virtualenv: `~/mopidy-env`
- Mopidy config, cache and data: `~/.config/mopidy`, `~/.cache/mopidy`, `~/.local/share/mopidy` (while Zinga has no TIDAL session of its own, it imports the login from `~/.local/share/mopidy/tidal/tidal-pkce.json`; reconnect TIDAL in Settings > Playback before deleting it)
- Mopidy user unit: `~/.config/systemd/user/mopidy.service`
- The `icecast2` package, its config `/etc/icecast2/icecast.xml` and the password files `~/.icecast_password`, `~/.icecast_admin_password`
- PulseAudio/PipeWire modules loaded at runtime: a `module-null-sink` named `mopidy_null` and a `module-loopback` from `mopidy_null.monitor` (gone after logout/reboot)
- Script logs in `~/.local/share/zinga/logs` and `/tmp/mopidy.log`, `/tmp/ffmpeg_icecast.log`

## Development Requirements

- Node.js (see `package.json`)
- pnpm
- Rust + Tauri prerequisites
- GStreamer development files (`libgstreamer1.0-dev`)

## Development

```bash
pnpm install
pnpm desktop:dev
```

Nuxt dev server runs on `5432` through Tauri `devUrl` (`src-tauri/tauri.conf.json`).

## Build

```bash
pnpm desktop:build
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT
