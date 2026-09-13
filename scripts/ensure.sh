#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
  esac
done

VENV_DIR="$HOME/mopidy-env"
MOPIDY_BIN="$VENV_DIR/bin/mopidy"

pipeline_ready() {
  local mopidy_ok=false icecast_ok=false ffmpeg_ok=false sink_ok=false

  if pgrep -f "python.*mopidy" >/dev/null 2>&1 || pgrep -f "$MOPIDY_BIN" >/dev/null 2>&1; then
    mopidy_ok=true
  fi
  if is_tcp_open 127.0.0.1 6680; then
    mopidy_ok=true
  fi

  if systemctl is-active --quiet icecast2 && is_tcp_open 127.0.0.1 8000; then
    icecast_ok=true
  fi

  if pgrep -f "ffmpeg.*(icecast|pulse)" >/dev/null 2>&1; then
    ffmpeg_ok=true
  fi

  if command -v pactl >/dev/null 2>&1; then
    if pactl list sources short 2>/dev/null | grep -q "mopidy_null.monitor"; then
      sink_ok=true
    fi
  else
    sink_ok=true
  fi

  [[ "$mopidy_ok" == true && "$icecast_ok" == true && "$ffmpeg_ok" == true && "$sink_ok" == true ]]
}

main() {
  log_title "Ensure audio pipeline"

  if [[ ! -x "$MOPIDY_BIN" && ! -f "$HOME/.config/mopidy/mopidy.conf" ]]; then
    log_error "Mopidy is not installed. Run setup first."
    zinga_write_exit_code "ensure" 1
    exit 1
  fi

  if [[ "$FORCE" != true ]] && pipeline_ready; then
    log_ok "Pipeline already ready"
    zinga_write_exit_code "ensure" 0
    exit 0
  fi

  if [[ "$FORCE" == true ]]; then
    log_info "Force restart requested"
    bash "$SCRIPT_DIR/restart.sh"
  else
    log_info "Pipeline incomplete — starting services"
    bash "$SCRIPT_DIR/start.sh"
  fi

  if pipeline_ready; then
    log_ok "Pipeline ready"
    zinga_write_exit_code "ensure" 0
    exit 0
  fi

  log_error "Pipeline still not ready after start. Check logs in $(zinga_log_dir)"
  zinga_write_exit_code "ensure" 1
  exit 1
}

main "$@"
