import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile, cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const repoRoot = path.resolve(root, '..');

async function copyStatic() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
  await copyFile(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));
  await cp(path.join(srcDir, 'renderer'), path.join(distDir, 'renderer'), { recursive: true });
}

function publicEnvValue(name, fallback = '') {
  return process.env[name] || process.env[name.replace(/^VITE_/, '')] || fallback;
}

async function writeRuntimeEnv() {
  const apiBase = publicEnvValue('VITE_API_BASE');
  const wsBase = publicEnvValue('VITE_WS_BASE');
  const env = {
    LAN_BOMBER_API_BASE: apiBase,
    LAN_BOMBER_WS_BASE: wsBase
  };

  await writeFile(
    path.join(distDir, 'env.js'),
    `window.LAN_BOMBER_ENV = ${JSON.stringify(env, null, 2)};\n` +
      `window.LAN_BOMBER_API_BASE = window.LAN_BOMBER_ENV.LAN_BOMBER_API_BASE || window.LAN_BOMBER_API_BASE;\n` +
      `window.LAN_BOMBER_WS_BASE = window.LAN_BOMBER_ENV.LAN_BOMBER_WS_BASE || window.LAN_BOMBER_WS_BASE;\n`
  );
}

async function copyAssets() {
  const assetsSrc = path.join(repoRoot, 'assets');
  const assetsDist = path.join(distDir, 'assets');
  if (existsSync(assetsSrc)) {
    await cp(assetsSrc, assetsDist, { recursive: true });
    console.log('Assets copied to dist/assets/');
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyStatic();
await writeRuntimeEnv();
await copyAssets();

console.log('Client static build complete:', distDir);
