#!/usr/bin/env sh
# linuxdeploy-plugin-gtk copies libgio/libgobject unconditionally (ignoring LINUXDEPLOY_EXCLUDED_LIBRARIES).
# Host GStreamer and gvfs modules need the host glib family, so strip it and repack the AppImage.
set -eu

for appimage in "$@"; do
  appimage="$(realpath "$appimage")"
  cache="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT

  mkdir "$work/app" "$work/tool"
  (cd "$work/app" && "$appimage" --appimage-extract >/dev/null)
  (cd "$work/tool" && "$cache/linuxdeploy-plugin-appimage.AppImage" --appimage-extract >/dev/null)

  offset="$("$appimage" --appimage-offset)"
  head -c "$offset" "$appimage" > "$work/runtime"

  rm -f "$work"/app/squashfs-root/usr/lib/libgst* \
    "$work"/app/squashfs-root/usr/lib/libglib-2.0.so* \
    "$work"/app/squashfs-root/usr/lib/libgobject-2.0.so* \
    "$work"/app/squashfs-root/usr/lib/libgio-2.0.so* \
    "$work"/app/squashfs-root/usr/lib/libgmodule-2.0.so* \
    "$work"/app/squashfs-root/usr/lib/libgthread-2.0.so*

  ARCH=x86_64 "$work/tool/squashfs-root/usr/bin/appimagetool" --no-appstream \
    --runtime-file "$work/runtime" "$work/app/squashfs-root" "$appimage.tmp" >/dev/null
  mv "$appimage.tmp" "$appimage"
  chmod +x "$appimage"
  rm -rf "$work"
  trap - EXIT
  echo "Stripped host-provided glib/GStreamer libraries from $appimage"
done
