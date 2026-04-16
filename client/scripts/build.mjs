import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const repoRoot = path.resolve(root, '..');
const sharedEntry = path.join(repoRoot, 'shared', 'dist', 'index.js');

async function copyStatic() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
  await copyFile(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));
}

async function copyAssets() {
  const assetsSrc = path.join(repoRoot, 'assets');
  const assetsDist = path.join(distDir, 'assets');
  if (existsSync(assetsSrc)) {
    await cp(assetsSrc, assetsDist, { recursive: true });
    console.log('Assets copied to dist/assets/');
  } else {
    console.warn('Warning: assets folder not found at', assetsSrc);
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyStatic();
await copyAssets();

const commonDefine = {
  'process.env.NODE_ENV': '"production"'
};

await esbuild.build({
  entryPoints: [path.join(srcDir, 'renderer', 'index.ts')],
  outfile: path.join(distDir, 'renderer.js'),
  bundle: true,
  alias: {
    '@lan-bomber/shared': sharedEntry
  },
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: true,
  define: commonDefine
});

console.log('Client build complete:', distDir);
