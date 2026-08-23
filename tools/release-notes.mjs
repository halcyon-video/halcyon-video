#!/usr/bin/env node
// Deterministic, offline release-notes generator.
//
//   node tools/release-notes.mjs --to v0.9.0
//     Print the grouped notes for v0.9.0 (auto-detects the previous tag by
//     semver) to stdout.
//
//   node tools/release-notes.mjs --to v0.9.0 --from v0.8.1
//     Same, with an explicit range.
//
//   node tools/release-notes.mjs --to v0.9.0 --changelog
//     Also prepend a "## [v0.9.0] — YYYY-MM-DD" entry to CHANGELOG.md
//     (created if it doesn't exist yet). No-op if that tag already has an
//     entry.
//
//   node tools/release-notes.mjs --to v0.9.0 --release --out notes.md
//     Write the full GitHub Release body (grouped notes + the standing
//     footer: demo link, Docker pull, Discord) to notes.md instead of
//     stdout — what .github/workflows/announce.yml feeds to
//     `gh release create --notes-file`.
//
// The whole point (see GH #104) is that this needs no model in the loop:
// commit subjects in this repo are already written as human sentences, and
// many already carry an "Area: " prefix (README:, Remote Play:, TV mode:,
// Signage:, 2.5D:, ...) which is exactly the grouping signal used below.
// What this script adds is: drop version-bump/release chore commits, group
// by that prefix (falling back to "General"), and turn `Fixes #NN` trailers
// (this repo's closing-keyword convention — see the private CLAUDE.md) into
// `Closes #NN` links.
//
// This file only ever produces TEXT (CHANGELOG.md + a release-notes body).
// The screenshot that goes with a release is a separate concern, taken by
// tools/shot.mjs and driven directly from announce.yml.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = 'halcyon-video/halcyon-video';
const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';

const CHORE_PATTERNS = [
  /^bump version to /i,
  /^release v\d/i,
];

// "Area: rest of the sentence" — area is 1-3 words, first word starts with a
// capital letter or digit (matches this repo's actual commit-subject style:
// "README:", "TV mode:", "Remote Play:", "2.5D:", "Signage:", ...).
const AREA_RE = /^([A-Z0-9][A-Za-z0-9&'/.-]*(?:\s+[A-Za-z0-9&'/.-]+){0,2}):\s+(.+)$/;

const FIXES_RE = /\b(?:fixes|closes|resolves)\s+#(\d+)/gi;

const CHANGELOG_HEADER = [
  '# Changelog',
  '',
  'All notable changes to Halcyon Video, generated from commit history by',
  '`tools/release-notes.mjs` — see `.github/workflows/announce.yml`, which runs',
  'it on every version tag push. Deterministic and offline: no entry here was',
  'written by a model.',
].join('\n');

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function parseArgs(argv) {
  const opts = {
    from: null,
    to: null,
    repo: DEFAULT_REPO,
    changelog: false,
    changelogPath: path.join(root, 'CHANGELOG.md'),
    release: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') opts.from = argv[++i];
    else if (a === '--to') opts.to = argv[++i];
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a === '--changelog') opts.changelog = true;
    else if (a === '--changelog-path') opts.changelogPath = path.resolve(argv[++i]);
    else if (a === '--release') opts.release = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`release-notes: unknown option ${a}`); process.exit(2); }
  }
  return opts;
}

function printHelp() {
  console.error([
    'Usage: node tools/release-notes.mjs --to <tag> [--from <tag>] [options]',
    '',
    '  --repo <owner/name>    default: halcyon-video/halcyon-video',
    '  --changelog            prepend an entry to CHANGELOG.md',
    '  --changelog-path <p>   default: CHANGELOG.md at repo root',
    '  --release               include the standing footer (demo/Docker/Discord)',
    '  --out <file>           write the notes body to a file instead of stdout',
  ].join('\n'));
}

function parseSemver(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function listVersionTags() {
  return git(['tag', '--list', 'v*']).split('\n').map((s) => s.trim()).filter(Boolean);
}

/** The tag with the greatest semver strictly below `to`, or null if `to` is the earliest. */
function previousTag(to) {
  const toVer = parseSemver(to);
  if (!toVer) return null;
  const candidates = listVersionTags()
    .map((t) => ({ t, v: parseSemver(t) }))
    .filter((x) => x.v && compareSemver(x.v, toVer) < 0)
    .sort((a, b) => compareSemver(b.v, a.v));
  return candidates.length ? candidates[0].t : null;
}

function currentTag() {
  try { return git(['describe', '--tags', '--exact-match', 'HEAD']).trim(); }
  catch { return null; }
}

// %(creatordate) resolves to the tagger date on an annotated tag and the
// commit date on a lightweight one (this repo has both kinds), unlike
// `git log --format=%aI <tag>`, which only ever reports the latter.
function tagDate(tag) {
  return git(['for-each-ref', `refs/tags/${tag}`, '--format=%(creatordate:short)']).trim();
}

/**
 * `Reverts <sha>` / git's own `This reverts commit <sha>` — either spelling,
 * anywhere in a commit body.
 */
const REVERTS_RE = /\b(?:this\s+)?reverts?(?:\s+commit)?\s+([0-9a-f]{7,40})\b/gi;

/**
 * Drop revert pairs. If a release range contains both a commit and the commit
 * that reverted it, neither shipped anything, and listing the original is a
 * release note that advertises a feature the release does not contain — which
 * is worse than saying nothing. A revert whose target is NOT in the range is a
 * real change (it removes something an earlier release shipped) and stays.
 */
function dropRevertPairs(commits) {
  const inRange = new Map();
  for (const c of commits) for (let n = 7; n <= c.hash.length; n++) inRange.set(c.hash.slice(0, n), c.hash);

  const dropped = new Set();
  for (const c of commits) {
    REVERTS_RE.lastIndex = 0;
    let m;
    while ((m = REVERTS_RE.exec(c.body))) {
      const target = inRange.get(m[1].toLowerCase());
      if (target) { dropped.add(target); dropped.add(c.hash); }
    }
  }
  return commits.filter((c) => !dropped.has(c.hash));
}

function collectCommits(from, to) {
  const range = from ? `${from}..${to}` : to;
  const format = `${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%b`;
  const raw = git(['log', '--no-merges', `--pretty=format:${format}`, range]);
  const commits = raw
    .split(RECORD_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rec) => {
      const [hash, subject = '', body = ''] = rec.split(FIELD_SEP);
      return { hash, subject: subject.trim(), body: body.trim() };
    });
  return dropRevertPairs(commits);
}

function isChore(subject) {
  return CHORE_PATTERNS.some((re) => re.test(subject));
}

function extractIssues(text) {
  const nums = new Set();
  let m;
  FIXES_RE.lastIndex = 0;
  while ((m = FIXES_RE.exec(text))) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** area name -> bullet text[] , in first-seen order within each area. */
function groupCommits(commits, repo) {
  const groups = new Map();
  for (const { subject, body } of commits) {
    if (!subject || isChore(subject)) continue;
    const m = AREA_RE.exec(subject);
    const area = m ? m[1] : 'General';
    let text = capitalize(m ? m[2] : subject);
    const issues = extractIssues(`${subject}\n${body}`);
    if (issues.length) {
      const links = issues.map((n) => `[#${n}](https://github.com/${repo}/issues/${n})`).join(', ');
      text += ` (Closes ${links})`;
    }
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(text);
  }
  return groups;
}

function renderBody(groups) {
  if (!groups.size) return '_No user-facing changes._';
  const areas = [...groups.keys()].filter((a) => a !== 'General').sort((a, b) => a.localeCompare(b));
  if (groups.has('General')) areas.push('General');
  return areas
    .map((area) => `### ${area}\n${groups.get(area).map((b) => `- ${b}`).join('\n')}`)
    .join('\n\n');
}

function renderFooter(tag, repo) {
  const [org, name] = repo.split('/');
  return [
    '---',
    '',
    `**Try it in a browser, no server, no signup:** https://${org}.github.io/${name}/`,
    '',
    `**Docker:** \`ghcr.io/${repo}:${tag}\` (amd64, arm64) — also \`:latest\``,
    '',
    '**Discord:** https://discord.gg/SN6FnJgQe — setup help, release notes, and show us the store you built.',
  ].join('\n');
}

/** Returns true if an entry was written, false if `tag` already had one. */
function updateChangelog(changelogPath, tag, date, body) {
  const heading = `## [${tag}] — ${date}`;
  const entry = `${heading}\n\n${body}`;
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, `${CHANGELOG_HEADER}\n\n${entry}\n`);
    return true;
  }
  const existing = fs.readFileSync(changelogPath, 'utf8');
  if (existing.includes(heading)) return false;
  const marker = existing.indexOf('\n## ');
  const header = (marker === -1 ? existing : existing.slice(0, marker)).trimEnd();
  const rest = marker === -1 ? '' : existing.slice(marker).trimStart();
  const next = rest ? `${header}\n\n${entry}\n\n${rest}` : `${header}\n\n${entry}\n`;
  fs.writeFileSync(changelogPath, next);
  return true;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const to = opts.to || currentTag();
  if (!to) {
    console.error('release-notes: --to <tag> is required (or run with HEAD checked out at a tag)');
    process.exit(2);
  }
  const from = opts.from || previousTag(to);
  const commits = collectCommits(from, to);
  const groups = groupCommits(commits, opts.repo);
  const body = renderBody(groups);

  if (opts.changelog) {
    const date = tagDate(to);
    const wrote = updateChangelog(opts.changelogPath, to, date, body);
    console.error(wrote
      ? `release-notes: wrote ${to} entry to ${path.relative(root, opts.changelogPath)}`
      : `release-notes: ${path.relative(root, opts.changelogPath)} already has an entry for ${to}, left it alone`);
  }

  const full = opts.release ? `${body}\n\n${renderFooter(to, opts.repo)}\n` : `${body}\n`;
  if (opts.out) {
    fs.writeFileSync(opts.out, full);
    console.error(`release-notes: wrote notes body to ${opts.out}`);
  } else {
    process.stdout.write(full);
  }
}

main();
