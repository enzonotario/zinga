# Runtime Scripts

These scripts are used internally by Zinga to manage the local Mopidy/Icecast runtime.

Main scripts:

- `setup.sh` — install apt deps, Icecast, Mopidy venv
- `ensure.sh` — idempotent pipeline check/start (used on app launch)
- `start.sh`
- `stop.sh`
- `restart.sh`
- `verify.sh`
- `uninstall.sh` — supports `--yes`, `--purge-icecast`, `--purge-mopidy-apt`, `--autoremove`

Logs:

- `~/.local/share/zinga/logs/<script>.log` — durable script output + `.exitcode`
- `/tmp/mopidy.log`
- `/tmp/ffmpeg_icecast.log`
