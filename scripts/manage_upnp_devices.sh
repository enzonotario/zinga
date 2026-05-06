#!/usr/bin/env bash

set -Eeuo pipefail

# shellcheck source=./lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

discover() {
  python3 <<'PYEOF'
import socket
import time
import urllib.request
import xml.etree.ElementTree as ET

MCAST_GRP = "239.255.255.250"
MCAST_PORT = 1900
ST = "urn:schemas-upnp-org:device:MediaRenderer:1"

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("", 0))
sock.settimeout(2)

msg = f"""M-SEARCH * HTTP/1.1\r
HOST: {MCAST_GRP}:{MCAST_PORT}\r
MAN: "ssdp:discover"\r
ST: {ST}\r
MX: 2\r
\r
"""
sock.sendto(msg.encode(), (MCAST_GRP, MCAST_PORT))

seen = {}
start = time.time()
index = 0
while time.time() - start < 3:
    try:
        data, addr = sock.recvfrom(4096)
    except socket.timeout:
        break
    response = data.decode("utf-8", errors="ignore")
    location = None
    for line in response.split("\r\n"):
        if line.upper().startswith("LOCATION:"):
            location = line.split(":", 1)[1].strip()
            break
    if not location or location in seen:
        continue
    seen[location] = addr[0]
    name = "Unknown"
    model = ""
    try:
        xml_data = urllib.request.urlopen(location, timeout=2).read()
        root = ET.fromstring(xml_data)
        ns = {"u": "urn:schemas-upnp-org:device-1-0"}
        n = root.find(".//u:friendlyName", ns)
        m = root.find(".//u:modelName", ns)
        if n is not None and n.text:
            name = n.text
        if m is not None and m.text:
            model = m.text
    except Exception:
        pass
    print(f"[{index}] {name} {model}".strip())
    print(f"    IP: {addr[0]}")
    print(f"    URL: {location}")
    index += 1

if index == 0:
    print("No UPnP renderers found.")
PYEOF
}

test_url() {
  local url="${1:-}"
  if [[ -z "$url" ]]; then
    log_error "Usage: $0 test <device-description-url>"
    exit 1
  fi
  if curl -fsS --connect-timeout 3 --max-time 5 "$url" >/dev/null; then
    log_ok "Device is reachable: $url"
  else
    log_error "Cannot reach device: $url"
    exit 1
  fi
}

case "${1:-list}" in
  list|discover) discover ;;
  test) test_url "${2:-}" ;;
  *)
    echo "Usage: $0 [list|discover|test <url>]"
    exit 1
    ;;
esac
