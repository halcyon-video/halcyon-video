#!/usr/bin/env node
// Run Blender and the existing sprite-sheet contract tools in the host runtime.
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.env.BLENDER_PATH || 'blender', ['-b', '-t', process.env.CLERK_RENDER_THREADS || '4',
  '--python-exit-code', '1', '--python', join(root, 'tools/models/video-clerk.py'), '--', '--render']);
for (const style of ['polo', 'oxford']) {
  const output = join(root, 'public/textures/clerk', style === 'polo' ? '' : 'oxford');
  mkdirSync(output, { recursive: true });
  for (const pass of ['color', 'livery']) run(process.execPath, [join(root, 'tools/clerk-sheet.mjs'),
    'stitch', join(root, 'scratch/clerk-render', style, pass), join(output, `${pass}.png`)]);
  run(process.execPath, [join(root, 'tools/clerk-sheet.mjs'), 'check', join(output, 'color.png')]);
}
