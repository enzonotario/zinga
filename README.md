# Zinga

Music app for UPnP devices, built with Nuxt 4 and Tauri 2.

> This project is still under active development.  
> Please report any issues, suggestions, or unexpected behavior.

## Features

- Play music on UPnP devices
- TIDAL integration
- Focus on displaying rich track and album credits

## Platform Status

Zinga is currently focused on and tested on Linux.

Contributions for Windows, macOS, and Android support are welcome.

## Requirements

- Node.js (see `package.json`)
- pnpm
- Rust + Tauri prerequisites

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
