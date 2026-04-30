import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile, cp } from 'node:fs/promises';
import fs from 'node:fs';

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

async function copyAssets() {
  const assetsSrc = path.join(repoRoot, 'assets');
  const assetsDist = path.join(distDir, 'assets');
  if (fs.existsSync(assetsSrc)) {
    await cp(assetsSrc, assetsDist, { recursive: true });
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyStatic();
await copyAssets();

fs.watch(srcDir, { recursive: true }, async () => {
  try {
    await copyStatic();
  } catch {
    // Ignore transient writes while editing.
  }
});

const assetsDir = path.join(repoRoot, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.watch(assetsDir, { recursive: true }, async () => {
    try {
      await copyAssets();
    } catch {
      // Ignore transient writes while editing.
    }
  });
}

console.log('[dev] static client assets watching:', distDir);
