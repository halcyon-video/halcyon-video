#!/usr/bin/env node
// Line-count budgets for the files that history shows regrow into god-files.
// three-scene.ts was split to ~5.5k lines on 2026-07-02, regrew to 13.7k by
// 2026-07-21, and was split again the same day — this gate is what makes the
// second split stick. If you hit a ceiling, DON'T raise it: move the feature
// into its own module (see the store-*.ts pattern — functions take the
// StoreScene as first parameter, the class keeps a one-line delegating stub).
// Raising a budget is a deliberate, reviewed decision, not a build fix.
import { readFileSync } from 'node:fs';

const BUDGETS = {
  'src/three-scene.ts': 6200,  // spine only: renderer, animate(), input, lifecycle
  'src/main.ts': 4600,         // UI wiring — next split candidate, don't feed it
  'src/video-case.ts': 6000,
};

let failed = false;
for (const [file, budget] of Object.entries(BUDGETS)) {
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split('\n').length;
  } catch {
    continue; // file removed/renamed — budget no longer applies
  }
  if (lines > budget) {
    console.error(
      `FILE BUDGET EXCEEDED: ${file} is ${lines} lines (budget ${budget}).\n` +
      `  Extract the new code into its own module instead of growing this file\n` +
      `  (see the store-*.ts extraction pattern in CLAUDE.md).`);
    failed = true;
  }
}
if (failed) process.exit(1);
