// Mirror everything the app says about itself to a file on disk.
//
// The webview console is invisible in a packaged Tauri build -- no devtools,
// no stdout -- so any failure that only ever printed a console warning was
// undebuggable from inside the app. That bit us repeatedly on the Jellyseerr
// integration, where four different silent gates all looked identical from
// the shop floor. This captures console.log/warn/error plus the in-app
// console lines and writes them somewhere readable.
//
// Performance: the app idles for days, so this must cost nothing at rest.
// Lines are buffered and flushed on a timer only when the buffer is dirty --
// no per-line IPC, no timer work when nothing is being logged. The buffer is
// capped so a runaway logger can't grow it without bound.
import { invoke } from '@tauri-apps/api/core';

const FLUSH_MS = 2000;
const MAX_BUFFER = 500;

let buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let truncateNext = true; // first write of a session replaces the old file
let dropped = 0;
let logPath: string | null = null;
let installed = false;

function hasTauri(): boolean {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (buffer.length === 0) return;
  if (dropped > 0) {
    buffer.push(`[debug-log] dropped ${dropped} line(s) -- buffer overflow`);
    dropped = 0;
  }
  const lines = buffer;
  buffer = [];
  const truncate = truncateNext;
  truncateNext = false;
  try {
    logPath = await invoke<string>('append_debug_log', { lines, truncate });
  } catch {
    // A failing diagnostics sink must never break the app it's diagnosing,
    // and must never recurse into the patched console methods below.
  }
}

function schedule(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => { void flush(); }, FLUSH_MS);
}

/** Queue one line. Safe to call before install() and outside Tauri (no-op). */
export function debugLog(line: string): void {
  if (!hasTauri()) return;
  if (buffer.length >= MAX_BUFFER) { dropped++; return; }
  const t = new Date().toISOString().slice(11, 23);
  buffer.push(`[${t}] ${line}`);
  schedule();
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/**
 * Patch console.log/warn/error to tee into the file. Call once, early -- the
 * interesting failures all happen during boot.
 */
export function installDebugLog(): void {
  if (installed || !hasTauri()) return;
  installed = true;

  (['log', 'warn', 'error'] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      debugLog(level === 'log' ? format(args) : `[${level.toUpperCase()}] ${format(args)}`);
    };
  });

  window.addEventListener('error', (e) => {
    debugLog(`[UNCAUGHT] ${e.message} @ ${e.filename}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    debugLog(`[UNHANDLED REJECTION] ${String((e as PromiseRejectionEvent).reason)}`);
  });

  // Anything already queued (and the boot banner) should land promptly rather
  // than wait out the first full interval.
  debugLog(`=== session start: ${new Date().toISOString()} ===`);
  void flush();
}

/** Absolute path of the log file, once the first flush has resolved it. */
export function debugLogPath(): string | null {
  return logPath;
}
