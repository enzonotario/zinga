#!/usr/bin/env sh
# linuxdeploy-plugin-gtk copies libgio/libgobject unconditionally (ignoring LINUXDEPLOY_EXCLUDED_LIBRARIES).
# Host GStreamer and gvfs modules need the host glib family, so strip it and repack the AppImage.
# Host libgio then loads libmount. A bundled libmount older than 2.40 hides MOUNT_2_40
# (Ubuntu 26.04+). Strip the mount stack so the host copies are used.
# The same host glib plus bundled GTK 3 fails to see monitors on Ubuntu 26.04 Wayland.
# Force the X11 backend so the window maps on XWayland.
# AppRun points GST_PLUGIN_SYSTEM_PATH at usr/lib/gstreamer-1.0, which this script removes.
# Point GST_PLUGIN_PATH at the host plugin directory so the system check can see them.
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
    "$work"/app/squashfs-root/usr/lib/libgthread-2.0.so* \
    "$work"/app/squashfs-root/usr/lib/libmount.so* \
    "$work"/app/squashfs-root/usr/lib/libblkid.so* \
    "$work"/app/squashfs-root/usr/lib/libselinux.so*

  if [ ! -e "$work/app/squashfs-root/AppRun.orig" ]; then
    mv "$work/app/squashfs-root/AppRun" "$work/app/squashfs-root/AppRun.orig"
  fi
  cat > "$work/app/squashfs-root/AppRun" << 'EOF'
#!/bin/sh
export GDK_BACKEND=x11
unset WAYLAND_DISPLAY
plugin_dir=$(ls -d /usr/lib/*/gstreamer-1.0 /usr/lib/gstreamer-1.0 2>/dev/null | head -1)
if [ -n "$plugin_dir" ]; then
  export GST_PLUGIN_PATH="$plugin_dir${GST_PLUGIN_PATH:+:$GST_PLUGIN_PATH}"
fi
exec "$(dirname "$(readlink -f "$0")")/AppRun.orig" "$@"
EOF
  chmod +x "$work/app/squashfs-root/AppRun"

  ARCH=x86_64 "$work/tool/squashfs-root/usr/bin/appimagetool" --no-appstream \
    --runtime-file "$work/runtime" "$work/app/squashfs-root" "$appimage.tmp" >/dev/null
  mv "$appimage.tmp" "$appimage"
  chmod +x "$appimage"
  rm -rf "$work"
  trap - EXIT
  echo "Stripped host-provided glib/GStreamer libraries from $appimage"
done
