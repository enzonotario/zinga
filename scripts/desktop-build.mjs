#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const isWindows = platform() === 'win32';
const isLinux = platform() === 'linux';

const LINUXDEPLOY_EXCLUDED_LIBRARIES = [
  'libgst*',
  'libglib-2.0.so*',
  'libgobject-2.0.so*',
  'libgio-2.0.so*',
  'libgmodule-2.0.so*',
  'libgthread-2.0.so*',
  'libmount.so*',
  'libblkid.so*',
  'libselinux.so*',
].join(';');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: isWindows,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function tauriArgs(bundleArgs = [], cargoArgs = []) {
  const args = ['exec', 'tauri', 'build', ...bundleArgs];
  if (cargoArgs.length > 0) {
    args.push('--', ...cargoArgs);
  }
  return args;
}

const env = { ...process.env };
if (process.env.CI) {
  env.CI = 'true';
}

const cargoArgs = (process.env.ZINGA_CARGO_ARGS || '')
  .split(/\s+/)
  .map((part) => part.trim())
  .filter(Boolean);

if (isLinux) {
  env.LINUXDEPLOY_EXCLUDED_LIBRARIES = LINUXDEPLOY_EXCLUDED_LIBRARIES;
  run('pnpm', tauriArgs([], cargoArgs), env);

  const targetDir = process.env.CARGO_TARGET_DIR || resolve(root, 'src-tauri/target');
  const images = globSync(`${targetDir.replaceAll('\\', '/')}/release/bundle/appimage/*.AppImage`);
  if (images.length === 0) {
    process.stderr.write('No AppImage artifacts found to patch.\n');
    process.exit(1);
  }
  run('sh', ['scripts/fix-appimage.sh', ...images], env);
  process.exit(0);
}

if (isWindows) {
  // Official GStreamer Windows MSIs are often unavailable from CI mirrors.
  // Ship NSIS without the local-player feature; UPnP/ffmpeg still works.
  const windowsCargoArgs = cargoArgs.length > 0 ? cargoArgs : ['--no-default-features'];
  run('pnpm', tauriArgs(['-b', 'nsis'], windowsCargoArgs), env);
  process.exit(0);
}

run('pnpm', tauriArgs([], cargoArgs), env);
