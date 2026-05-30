import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('demo', { recursive: true });

await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'demo/horizon-vm.js',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  treeShaking: true,
});

console.log('Bundled → demo/horizon-vm.js');
