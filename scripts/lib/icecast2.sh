#!/bin/bash

ZINGA_ICECAST_CONF="${ZINGA_ICECAST_CONF:-/etc/icecast2/icecast.xml}"

_zinga_icecast2_have_print() {
    type print_info &>/dev/null
}

zinga_icecast2_msg() {
    if _zinga_icecast2_have_print; then
        print_info "$1"
    else
        echo "[Zinga icecast2] $1"
    fi
}

zinga_icecast2_warn() {
    if type print_warning &>/dev/null; then
        print_warning "$1"
    else
        echo "[Zinga icecast2] $1" >&2
    fi
}

zinga_icecast2_ok() {
    if type print_success &>/dev/null; then
        print_success "$1"
    else
        echo "[Zinga icecast2] $1"
    fi
}

zinga_icecast2_debconf_hackme() {
    echo "icecast2 icecast2/icecast-setup boolean true" | sudo debconf-set-selections
    echo "icecast2 icecast2/hostname string 127.0.0.1" | sudo debconf-set-selections
    echo "icecast2 icecast2/sourcepassword string hackme" | sudo debconf-set-selections
    echo "icecast2 icecast2/relaypassword string hackme" | sudo debconf-set-selections
    echo "icecast2 icecast2/adminpassword string hackme" | sudo debconf-set-selections
}

zinga_icecast2_debconf_custom() {
    local sp="${1:-hackme}"
    local rp="${2:-hackme}"
    local ap="${3:-hackme}"
    echo "icecast2 icecast2/icecast-setup boolean true" | sudo debconf-set-selections
    echo "icecast2 icecast2/hostname string 127.0.0.1" | sudo debconf-set-selections
    echo "icecast2 icecast2/sourcepassword string $sp" | sudo debconf-set-selections
    echo "icecast2 icecast2/relaypassword string $rp" | sudo debconf-set-selections
    echo "icecast2 icecast2/adminpassword string $ap" | sudo debconf-set-selections
}

zinga_icecast2_find_deb() {
    local f ICEDEB
    for f in /var/cache/apt/archives/icecast2_*.deb; do
        if [ -f "$f" ]; then
            echo "$f"
            return 0
        fi
    done
    sudo bash -c 'cd /var/cache/apt/archives && apt download icecast2 2>/dev/null' || true
    ICEDEB=$(ls -t /var/cache/apt/archives/icecast2_*.deb 2>/dev/null | head -1)
    if [ -n "$ICEDEB" ] && [ -f "$ICEDEB" ]; then
        echo "$ICEDEB"
        return 0
    fi
    return 1
}

zinga_icecast2_extract_xml_from_deb() {
    local ICEDEB="$1"
    local TMP_ICE DATATAR
    if [ -z "$ICEDEB" ] || [ ! -f "$ICEDEB" ]; then
        return 1
    fi
    TMP_ICE=$(mktemp -d)
    if (cd "$TMP_ICE" && ar x "$ICEDEB" 2>/dev/null); then
        DATATAR=$(ls "$TMP_ICE"/data.tar.* 2>/dev/null | head -1)
        if [ -n "$DATATAR" ] && (cd "$TMP_ICE" && tar xf "$DATATAR" ./etc/icecast2/icecast.xml 2>/dev/null); then
            if [ -f "$TMP_ICE/etc/icecast2/icecast.xml" ]; then
                sudo mkdir -p /etc/icecast2
                sudo cp "$TMP_ICE/etc/icecast2/icecast.xml" "$ZINGA_ICECAST_CONF"
                rm -rf "$TMP_ICE"
                return 0
            fi
        fi
    fi
    rm -rf "$TMP_ICE"
    return 1
}

zinga_icecast2_ensure_group() {
    if ! id icecast2 &>/dev/null; then
        return 0
    fi
    if getent group icecast2 &>/dev/null; then
        return 0
    fi
    local gid gname
    gid=$(id -g icecast2)
    gname=$(getent group "$gid" 2>/dev/null | cut -d: -f1)
    if [ -n "$gname" ]; then
        return 0
    fi
    if sudo groupadd --gid "$gid" icecast2 2>/dev/null; then
        zinga_icecast2_ok "Grupo del sistema icecast2 (GID $gid) creado"
    else
        zinga_icecast2_warn "No se pudo crear el grupo icecast2; los permisos usarán GID numérico"
    fi
}

zinga_icecast2_set_config_ownership() {
    local conf="${1:-$ZINGA_ICECAST_CONF}"
    if [ ! -f "$conf" ]; then
        return 0
    fi
    if getent group icecast2 &>/dev/null; then
        if sudo chown root:icecast2 "$conf" 2>/dev/null && sudo chmod 640 "$conf"; then
            return 0
        fi
    fi
    if id icecast2 &>/dev/null; then
        if sudo chown root:"$(id -g icecast2)" "$conf" 2>/dev/null && sudo chmod 640 "$conf"; then
            return 0
        fi
    fi
    sudo chown root:root "$conf" 2>/dev/null || true
    sudo chmod 644 "$conf" 2>/dev/null || true
}

zinga_icecast2_repair_package_state() {
    if ! dpkg -s icecast2 &>/dev/null; then
        zinga_icecast2_warn "icecast2 no está instalado (dpkg)"
        return 1
    fi
    zinga_icecast2_debconf_hackme
    local ICEDEB
    if ! ICEDEB=$(zinga_icecast2_find_deb); then
        zinga_icecast2_warn "No se encontró el .deb de icecast2 en la caché de apt"
        return 1
    fi
    if [ ! -f "$ZINGA_ICECAST_CONF" ]; then
        zinga_icecast2_msg "Extrayendo icecast.xml desde el paquete..."
        if ! zinga_icecast2_extract_xml_from_deb "$ICEDEB"; then
            zinga_icecast2_warn "No se pudo extraer icecast.xml"
            return 1
        fi
    fi
    zinga_icecast2_ensure_group
    zinga_icecast2_set_config_ownership "$ZINGA_ICECAST_CONF"
    zinga_icecast2_msg "Completando configuración del paquete icecast2..."
    DEBIAN_FRONTEND=noninteractive sudo dpkg --configure icecast2 2>/dev/null || true
    zinga_icecast2_set_config_ownership "$ZINGA_ICECAST_CONF"
    sudo apt install -f -y 2>/dev/null || true
    if [ -f "$ZINGA_ICECAST_CONF" ]; then
        zinga_icecast2_ok "Estado del paquete icecast2 comprobado"
        return 0
    fi
    return 1
}

zinga_icecast2_repair_if_needed() {
    dpkg -s icecast2 &>/dev/null || return 0
    local st
    st=$(dpkg -s icecast2 2>/dev/null | sed -n 's/^Status: //p')
    if [ ! -f "$ZINGA_ICECAST_CONF" ]; then
        zinga_icecast2_msg "Reparando icecast2 (falta $ZINGA_ICECAST_CONF)..."
        zinga_icecast2_repair_package_state || :
    elif [[ "$st" == *"unpacked"* ]] || [[ "$st" == *"half-configured"* ]]; then
        zinga_icecast2_msg "Reparando icecast2 (dpkg: $st)..."
        zinga_icecast2_ensure_group
        zinga_icecast2_set_config_ownership "$ZINGA_ICECAST_CONF"
        DEBIAN_FRONTEND=noninteractive sudo dpkg --configure icecast2 2>/dev/null || true
        sudo apt install -f -y 2>/dev/null || true
    fi
    zinga_icecast2_ensure_group
    zinga_icecast2_set_config_ownership "$ZINGA_ICECAST_CONF"
}
