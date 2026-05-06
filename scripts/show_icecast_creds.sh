#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

admin_password="$(read_secret_file "$HOME/.icecast_admin_password" "hackme")"
source_password="$(read_secret_file "$HOME/.icecast_password" "hackme")"

log_title "Icecast credentials"
echo "Admin URL:      http://127.0.0.1:8000/admin/"
echo "Admin user:     admin"
echo "Admin password: $admin_password"
echo
echo "Source password: $source_password"
echo "Mountpoint:      /mopidy"
echo "Status URL:      http://127.0.0.1:8000/status-json.xsl"
