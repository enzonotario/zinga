#!/usr/bin/env bash

set -Eeuo pipefail

MOPIDY_LOG="/tmp/mopidy.log"
FFMPEG_LOG="/tmp/ffmpeg_icecast.log"

case "${1:-all}" in
  mopidy)
    tail -f "$MOPIDY_LOG"
    ;;
  stream|ffmpeg)
    tail -f "$FFMPEG_LOG"
    ;;
  clear)
    : >"$MOPIDY_LOG"
    : >"$FFMPEG_LOG"
    echo "Logs cleared."
    ;;
  all)
    tail -f "$MOPIDY_LOG" "$FFMPEG_LOG"
    ;;
  *)
    echo "Usage: $0 [all|mopidy|stream|clear]"
    exit 1
    ;;
esac
