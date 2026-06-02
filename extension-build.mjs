import { build } from 'esbuild';
import { mkdirSync, cpSync } from 'node:fs';

mkdirSync('extension/icons', { recursive: true });

await build({
  entryPoints: ['src/extension/content.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'extension/content.js',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  treeShaking: true,
});

console.log('Extension bundled → extension/content.js');
