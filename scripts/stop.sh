#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

stop_pattern() {
  local name="$1" pattern="$2"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    log_info "Stopping $name..."
    pkill -TERM -f "$pattern" 2>/dev/null || true
    sleep 2
    pkill -KILL -f "$pattern" 2>/dev/null || true
    if pgrep -f "$pattern" >/dev/null 2>&1; then
      log_warn "$name still running"
    else
      log_ok "$name stopped"
    fi
  else
    log_info "$name is not running"
  fi
}

stop_mopidy_service() {
  if systemctl --user is-active mopidy >/dev/null 2>&1; then
    systemctl --user stop mopidy || true
    sleep 1
  fi
}

main() {
  local keep_icecast=false
  [[ "${1:-}" == "--keep-icecast" || "${1:-}" == "-k" ]] && keep_icecast=true

  log_title "Stopping playback services"
  stop_pattern "ffmpeg stream" "ffmpeg.*(icecast|pulse)"
  stop_mopidy_service
  stop_pattern "Mopidy" "python.*mopidy"

  if [[ "$keep_icecast" == false ]]; then
    if systemctl is-active --quiet icecast2; then
      if sudo systemctl stop icecast2 2>/dev/null; then
        log_ok "Icecast2 stopped"
      else
        log_warn "Could not stop Icecast2 automatically"
      fi
    else
      log_info "Icecast2 is not running"
    fi
  else
    log_info "Keeping Icecast2 running"
  fi
}

main "$@"
