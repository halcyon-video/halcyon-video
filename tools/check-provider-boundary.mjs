#!/usr/bin/env node
// The media-server boundary, enforced (GH #32, #66).
//
// src/providers/ exists so that catalog, auth and playback code names a
// PROVIDER instead of a server product. Reaching past it into src/jellyfin.ts
// compiles cleanly, works perfectly on the maintainer's Jellyfin box, and
// silently breaks every Plex install — the request goes out in Jellyfin's
// shape, 404s, gets swallowed, and the feature just looks empty. That class of
// bug has now shipped four times (ambient-tvs.ts's HLS URL, the setup
// terminal's library list, the 3D episode gate, 2.5D's episode list). A rule
// is cheaper than a fifth investigation.
//
// THE RULE: outside src/providers/, you may import TYPES from jellyfin.ts —
// it is where the catalog types are re-exported from, and half the store reads
// `Movie` that way — but not VALUES. Call the provider instead:
//
//     import { activeProvider, sessionOf } from './providers/active-provider';
//     await activeProvider().fetchSeriesEpisodes(url, sessionOf(token, userId), id);
//
// If the method you need isn't on MediaSourceProvider yet, ADD IT THERE and
// implement it on both providers. That is the work the rule is protecting; a
// direct import is that work skipped.
//
// This is a plain node tripwire rather than an ESLint no-restricted-imports
// rule because the repo carries no linter at all (five devDependencies, no
// config, no lint script), and `npm run build` already gates on exactly this
// kind of script — see tools/check-file-budget.mjs and list-slots.mjs --check.
// Should ESLint ever land, this file's job moves into it wholesale.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';

const SRC = 'src';
const GUARDED_MODULE = resolve(SRC, 'jellyfin');
const EXEMPT_DIR = resolve(SRC, 'providers');

/**
 * Value imports that predate the boundary and are NOT the bug this guards
 * against. Name-level on purpose: an allowlisted file may keep exactly these
 * bindings, and a NEW value import into the same file still fails. Shrink this
 * list; never grow it without a reason on the line.
 */
const ALLOWED = {
  'src/boot-flow.ts': {
    names: ['fetchPublicUsers', 'normalizeUrl'],
    why: 'membership-card picker + address normalising, both pending the multiUserPicker reshape',
  },
  'src/library-settings.ts': {
    names: ['knownServerLibraries'],
    why: 'reads the cached library list jellyfin.ts happens to hold; not a server call',
  },
  'src/main.ts': {
    names: [
      'authenticateUser',
      'isHevcPassThroughEnabled',
      'buildSubtitleTrackUrl',
      'pickSubtitleDelivery',
      'collectionTmdbIds',
      'collectionSyncStats',
    ],
    why: 'login + subtitle/codec helpers and two collection registries, all pre-boundary',
  },
  'src/membership-cards.ts': {
    names: ['authenticateUser', 'buildUserAvatarUrl'],
    why: 'the picker is on the old path deliberately — it wants a reshape behind multiUserPicker',
  },
  'src/playback-flow.ts': {
    names: ['reportPlaybackStart', 'reportPlaybackProgress', 'reportPlaybackStopped'],
    why: 'playback reporting, called through playback-routing.ts on the Plex side',
  },
  'src/playback-routing.ts': {
    names: [
      'buildStaticStreamUrl',
      'buildHlsStreamUrl',
      'fetchItemPlaybackInfo',
      'reportPlaybackStart',
      'reportPlaybackProgress',
      'reportPlaybackStopped',
    ],
    why: 'this file IS the per-backend router — it imports both jellyfin.ts and plex.ts by design',
  },
  'src/store-setup-flow.ts': {
    names: ['fetchPublicUsers', 'rememberKnownLibraries', 'normalizeUrl'],
    why: 'setup terminal login + address normalising; library listing already moved to the provider',
  },
  'src/video-player.ts': {
    names: ['stopActiveEncoding', 'getLastHlsPlaySessionId', 'isStreamCopyUrl'],
    why: 'transcode teardown, pending the capability-gated cancelActiveTranscode path',
  },
};

// ── classify jellyfin.ts's exports ───────────────────────────────────────────
function exportKinds(file) {
  const text = readFileSync(file, 'utf8');
  const types = new Set();
  const values = new Set();

  // `export type { A, B } from '...'` / `export type { A, B }`
  for (const m of text.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
    for (const n of splitSpecifiers(m[1])) types.add(n.exported);
  }
  // `export { A, B } from '...'` — a VALUE re-export unless marked `type`
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const n of splitSpecifiers(m[1])) {
      (n.typeOnly ? types : values).add(n.exported);
    }
  }
  for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:interface|type)\s+(\w+)/gm)) {
    types.add(m[1]);
  }
  for (const m of text.matchAll(
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|enum)\s+(\w+)/gm
  )) {
    values.add(m[1]);
  }
  // A name declared both ways (a `export type {}` re-export also caught by the
  // looser `export {}` sweep) is a TYPE — the narrower form wins.
  for (const t of types) values.delete(t);
  return { types, values };
}

function splitSpecifiers(clause) {
  return clause
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const typeOnly = /^type\s+/.test(s);
      const body = s.replace(/^type\s+/, '');
      const [orig, alias] = body.split(/\s+as\s+/).map((x) => x.trim());
      return { exported: orig, local: alias || orig, typeOnly };
    });
}

// ── walk src/ ────────────────────────────────────────────────────────────────
function tsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (resolve(p) === EXEMPT_DIR) continue;
      tsFiles(p, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Blank out comments, keeping offsets and newlines so nothing else shifts.
 * Required, not cosmetic: this codebase writes long explanatory comment blocks
 * directly above its imports, and several of them contain the word "import" —
 * a scan of the raw text matches from inside the prose and reads the whole
 * comment as an import clause.
 */
function stripComments(text) {
  const out = text.split('');
  let i = 0;
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') {
      while (i < text.length && text[i] !== '\n') out[i++] = ' ';
    } else if (c === '/' && d === '*') {
      out[i++] = ' '; out[i++] = ' ';
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < text.length) { out[i++] = ' '; out[i++] = ' '; }
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') i++;
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Does this module specifier, seen from `fromFile`, resolve to src/jellyfin.ts? */
function isGuardedModule(spec, fromFile) {
  if (!spec.startsWith('.')) return false;
  const bare = spec.replace(/\.(ts|js|mjs)$/, '');
  return resolve(dirname(fromFile), bare) === GUARDED_MODULE;
}

const { types, values } = exportKinds(join(SRC, 'jellyfin.ts'));
if (values.size === 0) {
  console.error('PROVIDER BOUNDARY: read no value exports out of src/jellyfin.ts — the guard is blind, fix it.');
  process.exit(1);
}

// `import [type] <clause> from '<spec>'`. The clause is [^'"] so the match can
// never run past a string literal into the next statement, which is also what
// lets it span the multi-line import blocks this codebase writes.
const IMPORT_RE = /\bimport\s+(?:(type)\s+)?([^'"]*?)\s+from\s+(['"])([^'"]+)\3/g;
const BARE_IMPORT_RE = /\bimport\s+(['"])([^'"]+)\1/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(['"])([^'"]+)\1/g;
const REEXPORT_RE = /\bexport\s+(?:(type)\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+(['"])([^'"]+)\2/g;

const findings = []; // { file, name, why }
const usedAllow = new Map(); // file -> Set(names seen)

for (const file of tsFiles(SRC)) {
  const rel = relative('.', file).split(sep).join('/');
  const text = stripComments(readFileSync(file, 'utf8'));
  const hit = (name, why) => findings.push({ file: rel, name, why });

  for (const m of text.matchAll(IMPORT_RE)) {
    const [, typeKeyword, clause, , spec] = m;
    if (!isGuardedModule(spec, file)) continue;
    if (typeKeyword) continue; // `import type { ... }` — always fine

    const namespace = clause.match(/\*\s+as\s+(\w+)/);
    if (namespace) {
      hit(`* as ${namespace[1]}`, 'namespace import pulls the whole module in as a value');
      continue;
    }
    const defaultBinding = clause.replace(/\{[^}]*\}/g, '').replace(/,/g, '').trim();
    if (defaultBinding) hit(defaultBinding, 'default import');

    const braces = clause.match(/\{([^}]*)\}/);
    if (!braces) continue;
    for (const s of splitSpecifiers(braces[1])) {
      if (s.typeOnly) continue; // `import { type Movie }` — fine
      if (types.has(s.exported)) continue;
      if (values.has(s.exported)) {
        hit(s.exported, 'value import');
      } else {
        hit(s.exported, `not an export of src/jellyfin.ts — can't classify it, so it fails`);
      }
    }
  }

  for (const m of text.matchAll(BARE_IMPORT_RE)) {
    if (isGuardedModule(m[2], file)) hit(`(side effect)`, 'bare import evaluates the module');
  }
  for (const m of text.matchAll(DYNAMIC_IMPORT_RE)) {
    if (!isGuardedModule(m[2], file)) continue;
    // `import('./jellyfin').Movie` in a type position is an import TYPE — it is
    // erased, same as `import type`. A real dynamic import is awaited or
    // .then()'d, never followed straight by a member name.
    const after = text.slice(m.index + m[0].length).match(/^\s*\)\s*\.\s*(\w+)/);
    if (after && !['then', 'catch', 'finally'].includes(after[1])) continue;
    hit(`import()`, 'dynamic import resolves to the module object');
  }
  for (const m of text.matchAll(REEXPORT_RE)) {
    if (!m[1] && isGuardedModule(m[3], file)) hit(`(re-export)`, 're-exporting launders a value import');
  }
}

// ── judge ────────────────────────────────────────────────────────────────────
const violations = [];
for (const f of findings) {
  const allow = ALLOWED[f.file];
  if (allow && allow.names.includes(f.name)) {
    if (!usedAllow.has(f.file)) usedAllow.set(f.file, new Set());
    usedAllow.get(f.file).add(f.name);
    continue;
  }
  violations.push(f);
}

// A cleared allowlist entry is a nag, not a build break — someone fixing a
// thing must never be punished by the guard that asked for the fix.
for (const [file, entry] of Object.entries(ALLOWED)) {
  const seen = usedAllow.get(file) ?? new Set();
  const stale = entry.names.filter((n) => !seen.has(n));
  if (stale.length) {
    console.warn(
      `note: ${file} no longer imports ${stale.join(', ')} from jellyfin.ts — ` +
      `drop ${stale.length === entry.names.length ? 'the entry' : 'those names'} from ALLOWED in tools/check-provider-boundary.mjs.`
    );
  }
}

if (violations.length) {
  console.error('\nPROVIDER BOUNDARY VIOLATION — value import from src/jellyfin.ts outside src/providers/:\n');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.name}  (${v.why})`);
  }
  console.error(
    '\n  Go through the provider instead:\n' +
    "    import { activeProvider, sessionOf } from '<path>/providers/active-provider';\n" +
    '    await activeProvider().<method>(serverUrl, sessionOf(token, userId), ...);\n' +
    '\n  If MediaSourceProvider has no such method, add it there and implement it on\n' +
    '  BOTH providers. Types are exempt — `import type { Movie } from "./jellyfin"`\n' +
    '  is fine, and so is `import { type Movie }`.\n' +
    '\n  A genuinely pre-boundary import goes in ALLOWED in tools/check-provider-boundary.mjs\n' +
    '  with a reason. That list is meant to shrink.\n'
  );
  process.exit(1);
}
