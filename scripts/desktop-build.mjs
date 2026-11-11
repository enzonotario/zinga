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

function tauriArgs(extra = []) {
  return ['exec', 'tauri', 'build', ...extra];
}

const env = { ...process.env };
if (process.env.CI) {
  env.CI = 'true';
}

if (isLinux) {
  env.LINUXDEPLOY_EXCLUDED_LIBRARIES = LINUXDEPLOY_EXCLUDED_LIBRARIES;
  run('pnpm', tauriArgs(), env);

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
  run('pnpm', tauriArgs(['-b', 'nsis']), env);
  process.exit(0);
}

run('pnpm', tauriArgs(), env);
