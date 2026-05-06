#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { render } from 'takumi-js';

const root = resolve(import.meta.dirname, '..');
const blackLogoSvg = resolve(root, 'app/assets/icons/logo-black.svg');
const whiteLogoSvg = resolve(root, 'app/assets/icons/logo-white.svg');

const publicDir = resolve(root, 'public');
const publicAssetsDir = resolve(publicDir, 'assets');
const publicOgDir = resolve(publicDir, 'og');
const docsPublicAssetsDir = resolve(root, 'docs/public/assets');
const docsPublicOgDir = resolve(root, 'docs/public/og');
const tauriIconsDir = resolve(root, 'src-tauri/icons');

async function ensureDirs() {
  await mkdir(publicAssetsDir, { recursive: true });
  await mkdir(publicOgDir, { recursive: true });
  await mkdir(docsPublicAssetsDir, { recursive: true });
  await mkdir(docsPublicOgDir, { recursive: true });
}

async function copySourceSvgs() {
  await copyFile(blackLogoSvg, resolve(publicAssetsDir, 'logo-black.svg'));
  await copyFile(whiteLogoSvg, resolve(publicAssetsDir, 'logo-white.svg'));
  await copyFile(blackLogoSvg, resolve(docsPublicAssetsDir, 'logo-black.svg'));
  await copyFile(whiteLogoSvg, resolve(docsPublicAssetsDir, 'logo-white.svg'));
}

async function svgToPngBuffer(svgPath, size) {
  return sharp(svgPath)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
}

async function generateWebIcons() {
  const iconPng = await svgToPngBuffer(blackLogoSvg, 512);
  await writeFile(resolve(publicDir, 'logo.png'), iconPng);
  await writeFile(resolve(publicDir, 'favicon-32x32.png'), await svgToPngBuffer(blackLogoSvg, 32));
  await writeFile(resolve(publicDir, 'favicon-16x16.png'), await svgToPngBuffer(blackLogoSvg, 16));
  await writeFile(resolve(publicDir, 'apple-touch-icon.png'), await svgToPngBuffer(blackLogoSvg, 180));
}

function assertCommandOk(result, taskName) {
  if (result.status === 0) return;
  throw new Error(`${taskName} failed with exit code ${result.status ?? 'unknown'}`);
}

function generateTauriIcons() {
  const tauriResult = spawnSync(
    'pnpm',
    ['tauri', 'icon', blackLogoSvg, '--output', tauriIconsDir],
    { cwd: root, stdio: 'inherit' },
  );
  assertCommandOk(tauriResult, 'Tauri icon generation');
}

function buildOgTemplate({ background, titleColor, subtitleColor, logoDataUrl }) {
  return `
  <div style="width:1200px;height:630px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:64px;background:${background};font-family:Inter,Segoe UI,Arial,sans-serif">
    <div style="display:flex;align-items:center;gap:24px;position:relative;z-index:1">
      <div style="width:172px;height:172px;border-radius:36px;background:rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;box-shadow:0 14px 34px rgba(15,23,42,0.2)">
        <img src="${logoDataUrl}" width="142" height="142" style="border-radius:28px" />
      </div>
      <div style="display:flex;flex-direction:column">
        <div style="font-size:88px;font-weight:700;line-height:1;color:${titleColor}">Zinga</div>
        <div style="font-size:36px;margin-top:8px;color:${subtitleColor}">Music app for UPnP devices</div>
      </div>
    </div>
    <div style="font-size:30px;color:${subtitleColor};position:relative;z-index:1">
      Nuxt 4 + Tauri 2 · TIDAL · Rich Credits
    </div>
  </div>
  `;
}

async function generateOgImages() {
  const blackLogoPng = await sharp(await readFile(blackLogoSvg))
    .resize(256, 256, { fit: 'contain' })
    .png()
    .toBuffer();
  const whiteLogoPng = await sharp(await readFile(whiteLogoSvg))
    .resize(256, 256, { fit: 'contain' })
    .png()
    .toBuffer();
  const blackLogoDataUrl = `data:image/png;base64,${blackLogoPng.toString('base64')}`;
  const whiteLogoDataUrl = `data:image/png;base64,${whiteLogoPng.toString('base64')}`;

  const lightImage = await render(
    buildOgTemplate({
      background: 'radial-gradient(circle at 12% 8%, rgba(56,189,248,0.32) 0%, rgba(56,189,248,0) 36%), radial-gradient(circle at 92% 96%, rgba(168,85,247,0.26) 0%, rgba(168,85,247,0) 45%), radial-gradient(circle at 52% 94%, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0) 34%), linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      titleColor: '#0f172a',
      subtitleColor: '#334155',
      logoDataUrl: blackLogoDataUrl,
    }),
    { width: 1200, height: 630 },
  );

  const darkImage = await render(
    buildOgTemplate({
      background: 'radial-gradient(circle at 10% 10%, rgba(56,189,248,0.34) 0%, rgba(56,189,248,0) 34%), radial-gradient(circle at 88% 86%, rgba(244,114,182,0.22) 0%, rgba(244,114,182,0) 42%), radial-gradient(circle at 52% 104%, rgba(52,211,153,0.2) 0%, rgba(52,211,153,0) 30%), linear-gradient(135deg, #020617 0%, #0f172a 100%)',
      titleColor: '#f8fafc',
      subtitleColor: '#cbd5e1',
      logoDataUrl: whiteLogoDataUrl,
    }),
    { width: 1200, height: 630 },
  );

  await writeFile(resolve(publicOgDir, 'zinga-og-light.png'), lightImage);
  await writeFile(resolve(publicOgDir, 'zinga-og-dark.png'), darkImage);
  await writeFile(resolve(publicDir, 'og-image.png'), lightImage);
  await writeFile(resolve(docsPublicOgDir, 'zinga-og-light.png'), lightImage);
  await writeFile(resolve(docsPublicOgDir, 'zinga-og-dark.png'), darkImage);
}

async function main() {
  await ensureDirs();
  await copySourceSvgs();
  await generateWebIcons();
  generateTauriIcons();
  await generateOgImages();
  process.stdout.write('Assets generated successfully.\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
