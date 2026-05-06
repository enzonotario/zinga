#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
# shellcheck source=./lib/icecast2.sh
source "$SCRIPT_DIR/lib/icecast2.sh"

issues=0

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    log_ok "$cmd available"
  else
    log_warn "$cmd missing"
    issues=$((issues + 1))
  fi
}

check_port() {
  local port="$1"
  if ss -tln 2>/dev/null | grep -q ":$port "; then
    log_ok "Port $port is listening"
  else
    log_info "Port $port is not listening"
  fi
}

main() {
  log_title "System verification"
  check_cmd python3
  check_cmd ffmpeg
  check_cmd pactl

  if [[ -d "$HOME/mopidy-env" ]]; then
    log_ok "Virtual env exists: $HOME/mopidy-env"
  else
    log_warn "Virtual env missing: $HOME/mopidy-env"
    issues=$((issues + 1))
  fi

  if [[ -f "$HOME/.config/mopidy/mopidy.conf" ]]; then
    log_ok "Mopidy config found"
  else
    log_warn "Mopidy config missing"
    issues=$((issues + 1))
  fi

  zinga_icecast2_repair_if_needed || true
  if systemctl is-active --quiet icecast2; then
    log_ok "Icecast2 is active"
  else
    log_warn "Icecast2 is not active"
  fi

  check_port 6680
  check_port 8000

  if [[ "$issues" -gt 0 ]]; then
    log_warn "Verification completed with $issues issue(s)"
    exit 1
  fi
  log_ok "Verification completed successfully"
}

main "$@"
