#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
# shellcheck source=./lib/icecast2.sh
source "$SCRIPT_DIR/lib/icecast2.sh"

ICECAST_CONF="/etc/icecast2/icecast.xml"
ADMIN_PASSWORD="$(read_secret_file "$HOME/.icecast_admin_password" "hackme")"
SOURCE_PASSWORD="$(read_secret_file "$HOME/.icecast_password" "hackme")"

main() {
  log_title "Fix Icecast credentials"
  sudo python3 <<PYEOF
import xml.etree.ElementTree as ET

conf_file = "${ICECAST_CONF}"
admin_password = "${ADMIN_PASSWORD}"
source_password = "${SOURCE_PASSWORD}"

tree = ET.parse(conf_file)
root = tree.getroot()
auth = root.find('authentication')
if auth is None:
    auth = ET.SubElement(root, 'authentication')

for tag, value in [
    ('admin-user', 'admin'),
    ('admin-password', admin_password),
    ('source-password', source_password),
    ('relay-password', source_password),
]:
    el = auth.find(tag)
    if el is None:
        el = ET.SubElement(auth, tag)
    el.text = value

tree.write(conf_file, encoding='utf-8', xml_declaration=True, short_empty_elements=False)
print("OK")
PYEOF

  zinga_icecast2_ensure_group || true
  zinga_icecast2_set_config_ownership "$ICECAST_CONF" || true
  sudo systemctl restart icecast2
  if systemctl is-active --quiet icecast2; then
    log_ok "Icecast2 credentials fixed and service restarted"
  else
    log_error "Icecast2 restart failed"
    exit 1
  fi
}

main "$@"
