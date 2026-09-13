#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

YES=false
PURGE_ICECAST=false
PURGE_MOPIDY_APT=false
AUTOREMOVE=false

for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=true ;;
    --purge-icecast) PURGE_ICECAST=true ;;
    --purge-mopidy-apt) PURGE_MOPIDY_APT=true ;;
    --autoremove) AUTOREMOVE=true ;;
  esac
done

confirm() {
  if [[ "$YES" == true ]]; then
    return 1
  fi
  read -r -p "$1 [y/N]: " response
  [[ "$response" =~ ^[Yy]$ ]]
}

main() {
  log_title "Uninstall Mopidy stack"

  if [[ "$YES" != true ]]; then
    if ! confirm "This removes Mopidy config and venv. Continue?"; then
      log_warn "Aborted."
      exit 0
    fi
  fi

  bash "$SCRIPT_DIR/stop.sh" --keep-icecast || true

  systemctl --user disable mopidy 2>/dev/null || true
  systemctl --user stop mopidy 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/mopidy.service"
  systemctl --user daemon-reload || true

  rm -rf "$HOME/mopidy-env"
  rm -rf "$HOME/.config/mopidy"
  rm -rf "$HOME/.cache/mopidy"
  rm -rf "$HOME/.local/share/mopidy"
  rm -f "$HOME/.icecast_password" "$HOME/.icecast_admin_password"

  if [[ "$PURGE_MOPIDY_APT" == true ]] || confirm "Remove system package 'mopidy' and repo?"; then
    sudo apt remove -y mopidy || true
    sudo rm -f /etc/apt/sources.list.d/mopidy.list /etc/apt/keyrings/mopidy-archive-keyring.gpg
    sudo apt update || true
  fi

  if [[ "$PURGE_ICECAST" == true ]] || confirm "Remove Icecast2 package?"; then
    sudo systemctl stop icecast2 2>/dev/null || true
    sudo apt remove -y icecast2 || true
    sudo rm -rf /etc/icecast2
  fi

  if [[ "$AUTOREMOVE" == true ]] || confirm "Run apt autoremove?"; then
    sudo apt autoremove -y || true
  fi

  log_ok "Uninstall completed."
}

main "$@"
