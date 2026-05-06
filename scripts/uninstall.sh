#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

confirm() {
  read -r -p "$1 [y/N]: " response
  [[ "$response" =~ ^[Yy]$ ]]
}

main() {
  log_title "Uninstall Mopidy stack"
  if ! confirm "This removes Mopidy config, venv, and optional Icecast package. Continue?"; then
    log_warn "Aborted."
    exit 0
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

  if confirm "Remove system package 'mopidy' and repo?"; then
    sudo apt remove -y mopidy || true
    sudo rm -f /etc/apt/sources.list.d/mopidy.list /etc/apt/keyrings/mopidy-archive-keyring.gpg
    sudo apt update || true
  fi

  if confirm "Remove Icecast2 package?"; then
    sudo systemctl stop icecast2 2>/dev/null || true
    sudo apt remove -y icecast2 || true
    sudo rm -rf /etc/icecast2
  fi

  if confirm "Run apt autoremove?"; then
    sudo apt autoremove -y || true
  fi

  log_ok "Uninstall completed."
}

main "$@"
