#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
# shellcheck source=./lib/icecast2.sh
source "$SCRIPT_DIR/lib/icecast2.sh"

MOPIDY_DIR="$HOME/.config/mopidy"
MOPIDY_CONF="$MOPIDY_DIR/mopidy.conf"
VENV_DIR="$HOME/mopidy-env"
MUSIC_DIR="$HOME/Music"
ICECAST_CONF="/etc/icecast2/icecast.xml"

require_non_root() {
  if [[ "$EUID" -eq 0 ]]; then
    log_error "Run this script as a regular user (without sudo)."
    exit 1
  fi
}

install_packages() {
  log_title "Installing system dependencies"
  sudo apt update
  sudo apt install -y \
    curl wget gnupg software-properties-common \
    python3 python3-pip python3-venv python3-dev \
    build-essential git python3-dbus \
    ffmpeg \
    gstreamer1.0-tools gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly gstreamer1.0-alsa \
    gstreamer1.0-pulseaudio python3-gst-1.0 \
    gir1.2-gstreamer-1.0 gir1.2-gst-plugins-base-1.0 \
    python3-gi python3-gi-cairo gir1.2-gtk-3.0
}

configure_icecast() {
  log_title "Installing and configuring Icecast2"
  local source_pw relay_pw admin_pw
  source_pw="$(read_secret_file "$HOME/.icecast_password" "")"
  admin_pw="$(read_secret_file "$HOME/.icecast_admin_password" "")"
  [[ -z "$source_pw" ]] && source_pw="$(openssl rand -base64 12 | tr -d '=+/' | cut -c1-12)"
  [[ -z "$admin_pw" ]] && admin_pw="$(openssl rand -base64 16 | tr -d '=+/' | cut -c1-16)"
  relay_pw="$source_pw"

  echo "$source_pw" >"$HOME/.icecast_password"
  echo "$admin_pw" >"$HOME/.icecast_admin_password"
  chmod 600 "$HOME/.icecast_password" "$HOME/.icecast_admin_password"

  echo "icecast2 icecast2/icecast-setup boolean true" | sudo debconf-set-selections
  echo "icecast2 icecast2/hostname string 127.0.0.1" | sudo debconf-set-selections
  echo "icecast2 icecast2/sourcepassword string $source_pw" | sudo debconf-set-selections
  echo "icecast2 icecast2/relaypassword string $relay_pw" | sudo debconf-set-selections
  echo "icecast2 icecast2/adminpassword string $admin_pw" | sudo debconf-set-selections

  DEBIAN_FRONTEND=noninteractive sudo apt install -y icecast2
  zinga_icecast2_repair_if_needed || true

  sudo python3 <<PYEOF
import xml.etree.ElementTree as ET
tree = ET.parse("${ICECAST_CONF}")
root = tree.getroot()
auth = root.find("authentication")
if auth is None:
    auth = ET.SubElement(root, "authentication")
for tag, value in [
    ("source-password", "${source_pw}"),
    ("relay-password", "${relay_pw}"),
    ("admin-password", "${admin_pw}"),
]:
    el = auth.find(tag)
    if el is None:
        el = ET.SubElement(auth, tag)
    el.text = value
for tag, value in [("hostname", "127.0.0.1"), ("bind-address", "127.0.0.1")]:
    el = root.find(tag)
    if el is not None:
        el.text = value
tree.write("${ICECAST_CONF}", encoding="utf-8", xml_declaration=True, short_empty_elements=False)
print("OK")
PYEOF
  zinga_icecast2_ensure_group || true
  zinga_icecast2_set_config_ownership "$ICECAST_CONF" || true
  sudo systemctl enable icecast2
  sudo systemctl restart icecast2
}

install_mopidy_venv() {
  log_title "Installing Mopidy virtual environment"
  rm -rf "$VENV_DIR"
  python3 -m venv --system-site-packages "$VENV_DIR"
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip setuptools wheel
  pip install Mopidy-Tidal Mopidy-Local Mopidy-MPD Mopidy-Iris
}

write_mopidy_config() {
  log_title "Writing Mopidy configuration"
  mkdir -p "$MOPIDY_DIR" "$HOME/.cache/mopidy" "$HOME/.local/share/mopidy" "$MUSIC_DIR"
  cat >"$MOPIDY_CONF" <<EOF
[core]
cache_dir = $HOME/.cache/mopidy
config_dir = $MOPIDY_DIR
data_dir = $HOME/.local/share/mopidy
max_tracklist_length = 10000
restore_state = true

[audio]
output = pulsesink device=mopidy_null
mixer = software

[file]
enabled = true
media_dirs = $MUSIC_DIR

[http]
enabled = true
hostname = 0.0.0.0
port = 6680
allowed_origins = *
csrf_protection = false

[tidal]
enabled = true
quality = LOSSLESS
client_id = Awy8t9IXCU3yy18C
client_secret = r8qoP64sdDknqD84h5Ke4ie5UEQTz8gATDurFA5SPWY=
login_method = AUTO
auth_method = PKCE

[iris]
enabled = true
country = AR
locale = es_AR
EOF
}

configure_systemd_user() {
  log_title "Configuring user service"
  local unit_dir="$HOME/.config/systemd/user"
  mkdir -p "$unit_dir"
  cat >"$unit_dir/mopidy.service" <<EOF
[Unit]
Description=Mopidy music server
After=network.target sound.target

[Service]
Type=simple
ExecStart=$VENV_DIR/bin/mopidy
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable mopidy.service
}

main() {
  require_non_root
  require_cmd apt
  install_packages
  configure_icecast
  install_mopidy_venv
  write_mopidy_config
  configure_systemd_user
  log_title "Setup completed"
  echo "Run: bash $SCRIPT_DIR/start.sh"
}

main "$@"
