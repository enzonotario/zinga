#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_title() {
  echo -e "\n${CYAN}========================================${NC}"
  echo -e "${CYAN}$*${NC}"
  echo -e "${CYAN}========================================${NC}\n"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Missing required command: $1"
    return 1
  fi
}

read_secret_file() {
  local file="$1" fallback="${2:-}"
  if [[ -f "$file" ]]; then
    <"$file" tr -d '\n'
  else
    echo -n "$fallback"
  fi
}

zinga_log_dir() {
  echo "${XDG_DATA_HOME:-$HOME/.local/share}/zinga/logs"
}

zinga_ensure_log_dir() {
  mkdir -p "$(zinga_log_dir)"
}

zinga_write_exit_code() {
  local name="$1" code="$2"
  zinga_ensure_log_dir
  echo "$code" >"$(zinga_log_dir)/${name}.exitcode"
}

zinga_log_path() {
  local name="$1"
  echo "$(zinga_log_dir)/${name}.log"
}

is_tcp_open() {
  local host="$1" port="$2"
  bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null
}
