#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
# shellcheck source=./lib/icecast2.sh
source "$SCRIPT_DIR/lib/icecast2.sh"

VENV_DIR="$HOME/mopidy-env"
MOPIDY_LOG="/tmp/mopidy.log"
FFMPEG_LOG="/tmp/ffmpeg_icecast.log"

sanitize_runtime_env() {
  unset APPDIR APPIMAGE APPIMAGE_SILENT_INSTALL ARGV0
  unset LD_LIBRARY_PATH PERLLIB PYTHONDONTWRITEBYTECODE
  unset PYTHONHOME PYTHONPATH
  unset GST_PLUGIN_SYSTEM_PATH GST_PLUGIN_SYSTEM_PATH_1_0
  unset GIO_EXTRA_MODULES GDK_PIXBUF_MODULE_FILE
  unset GTK_EXE_PREFIX GTK_DATA_PREFIX GTK_PATH GTK_IM_MODULE_FILE GTK_MODULES GTK3_MODULES
  unset QT_PLUGIN_PATH GSETTINGS_SCHEMA_DIR
  export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$HOME/.local/bin:$PATH"
}

wait_for_tcp() {
  local host="$1" port="$2" max="${3:-45}" n=0
  while [[ "$n" -lt "$max" ]]; do
    if bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
      return 0
    fi
    n=$((n + 1))
    sleep 1
  done
  return 1
}

wait_for_pulse_source() {
  local source="$1" max="${2:-20}" n=0
  while [[ "$n" -lt "$max" ]]; do
    if pactl list sources short 2>/dev/null | grep -q "^.*[[:space:]]$source[[:space:]]"; then
      return 0
    fi
    n=$((n + 1))
    sleep 1
  done
  return 1
}

ensure_prerequisites() {
  if [[ ! -d "$VENV_DIR" ]] || [[ ! -f "$HOME/.config/mopidy/mopidy.conf" ]]; then
    log_error "Mopidy is not configured. Run: bash $SCRIPT_DIR/setup.sh"
    exit 1
  fi
  require_cmd ffmpeg
  require_cmd python3
}

start_icecast() {
  log_title "Step 1/3 - Icecast2"
  zinga_icecast2_repair_if_needed || true
  if sudo systemctl restart icecast2 2>/dev/null && systemctl is-active --quiet icecast2; then
    log_ok "Icecast2 is running"
  else
    log_warn "Could not restart Icecast2 automatically. Run: sudo systemctl restart icecast2"
  fi
}

start_mopidy() {
  log_title "Step 2/3 - Mopidy"
  sanitize_runtime_env
  pkill -f "python.*mopidy" 2>/dev/null || true
  source "$VENV_DIR/bin/activate"
  nohup python3 -m mopidy >"$MOPIDY_LOG" 2>&1 &
  local pid="$!"
  sleep 5
  if ps -p "$pid" >/dev/null 2>&1; then
    log_ok "Mopidy started (PID: $pid)"
  else
    log_error "Mopidy failed to start. Check: $MOPIDY_LOG"
    exit 1
  fi
}

ensure_audio_pipeline() {
  if ! command -v pactl >/dev/null 2>&1; then
    log_warn "pactl not found. Skipping PulseAudio/PipeWire setup."
    return
  fi
  if ! pactl list sinks short | grep -q "mopidy_null"; then
    pactl load-module module-null-sink sink_name=mopidy_null sink_properties=device.description="Mopidy_Virtual_Output" >/dev/null || true
  fi
  if ! wait_for_pulse_source "mopidy_null.monitor" 20; then
    log_warn "Pulse monitor source is not ready yet (mopidy_null.monitor)"
  fi
  if ! pactl list modules short | grep -q "module-loopback.*mopidy_null"; then
    pactl load-module module-loopback source=mopidy_null.monitor sink=@DEFAULT_SINK@ >/dev/null 2>&1 || true
  fi
}

start_stream() {
  log_title "Step 3/3 - ffmpeg stream"
  pkill -f "ffmpeg.*(icecast|pulse)" 2>/dev/null || true
  local icecast_password
  icecast_password="$(read_secret_file "$HOME/.icecast_password" "hackme")"
  if ! wait_for_tcp 127.0.0.1 8000 45; then
    log_error "Icecast2 is not listening on 127.0.0.1:8000"
    exit 1
  fi
  local encoded_password
  encoded_password="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${icecast_password}', safe=''))")"
  nohup ffmpeg -f pulse -i "mopidy_null.monitor" \
    -acodec libmp3lame -ab 320k -ac 2 -ar 44100 \
    -content_type audio/mpeg -f mp3 \
    "icecast://source:${encoded_password}@127.0.0.1:8000/mopidy" \
    -loglevel error >"$FFMPEG_LOG" 2>&1 &
  local pid="$!"
  sleep 4
  if ps -p "$pid" >/dev/null 2>&1; then
    log_ok "Stream started (PID: $pid)"
  else
    log_error "ffmpeg failed to start. Check: $FFMPEG_LOG"
    exit 1
  fi
}

print_summary() {
  log_title "System ready"
  echo "Mopidy UI:  http://localhost:6680/iris/"
  echo "Icecast:    http://127.0.0.1:8000"
  echo "Stream URL: http://127.0.0.1:8000/mopidy"
  echo
  echo "Logs:"
  echo "  $MOPIDY_LOG"
  echo "  $FFMPEG_LOG"
}

main() {
  ensure_prerequisites
  start_icecast
  start_mopidy
  ensure_audio_pipeline
  start_stream
  print_summary
}

main "$@"
