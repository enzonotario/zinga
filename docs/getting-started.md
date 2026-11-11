# Primeros pasos

## 1. Descargar Zinga

<ReleaseDownloads />

## 2. Instalar dependencias

Zinga usa `ffmpeg` para transmitir audio a dispositivos UPnP y GStreamer para reproducir en este equipo.

### Linux (Debian/Ubuntu)

```bash
sudo apt install ffmpeg gstreamer1.0-plugins-good gstreamer1.0-plugins-base
```

### Windows

1. Instalá `ffmpeg` y agregalo al `PATH` (por ejemplo con [winget](https://winget.run/) / [scoop](https://scoop.sh/) / [chocolatey](https://chocolatey.org/)).
2. Para reproducir en dispositivos UPnP alcanza con `ffmpeg`.
3. La reproducción local en el propio Windows (GStreamer) todavía es experimental; preferí una salida UPnP.

### macOS

```bash
brew install ffmpeg gstreamer gst-plugins-base gst-plugins-good
```

Si falta algo, la app abre la página de verificación del sistema al iniciar. Ahí podés volver a verificar después de instalar.

## 3. Conectar TIDAL

1. Abrí Configuración > Reproducción
1. Elegí "Conectar TIDAL" y autorizá tu cuenta
1. Volvé a Zinga y confirmá que TIDAL figura conectado

## 4. Empezar a usar la app

- Elegí un dispositivo UPnP
- Reproducí un álbum
- Explorá créditos y letras desde la vista de reproducción
