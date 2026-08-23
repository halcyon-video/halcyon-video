#!/usr/bin/env node
// Fans one release announcement out to Discord, Mastodon, Bluesky, and X, and
// writes a Reddit-ready draft for the owner to post by hand (issue #105).
//
//   node tools/announce-fanout.mjs discord --tag v0.9.0 --screenshot shot.png
//   node tools/announce-fanout.mjs reddit-draft --tag v0.9.0 --out draft.md
//
// Every network channel is independent and fails soft: a dead integration
// logs a ::warning:: and this process still exits 0, so one broken channel
// never blocks the others or the release itself — .github/workflows/
// announce.yml also runs each channel as its own step with
// continue-on-error: true, so the guarantee holds even if this file's own
// try/catch is ever bypassed. A channel with no secrets configured is
// treated the same as a channel that isn't wired up yet: skipped with a
// ::notice::, not an error.
//
// The text posted here is NOT the full release notes (that's the GitHub
// Release body from tools/release-notes.mjs) — it's a short blurb built the
// same deterministic, no-model way: the first couple of non-chore commit
// subjects in the tag range, same grouping rules as release-notes.mjs.
//
// Reddit is never auto-posted (owner ruling, GH #105): the value on Reddit
// is the comment thread underneath, which no webhook can hold up, and
// Reddit's closed OAuth-app registration means an approval ticket must never
// gate the rest of the fan-out. reddit-draft only writes a file; announce.yml
// attaches it to the GitHub Release as a plain asset.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = 'halcyon-video/halcyon-video';

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function parseArgs(argv) {
  const [channel, ...rest] = argv;
  const opts = { channel, tag: null, screenshot: null, repo: DEFAULT_REPO, out: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--tag') opts.tag = rest[++i];
    else if (a === '--screenshot') opts.screenshot = rest[++i];
    else if (a === '--repo') opts.repo = rest[++i];
    else if (a === '--out') opts.out = rest[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`announce-fanout: unknown option ${a}`); process.exit(2); }
  }
  if (!opts.channel) { printHelp(); process.exit(2); }
  if (!opts.tag) { console.error('announce-fanout: --tag <vX.Y.Z> is required'); process.exit(2); }
  return opts;
}

function printHelp() {
  console.error([
    'Usage: node tools/announce-fanout.mjs <channel> --tag <vX.Y.Z> [options]',
    '',
    '  channel                one of: discord, mastodon, bluesky, x, reddit-draft',
    '  --screenshot <path>    release screenshot PNG (optional, best-effort)',
    '  --repo <owner/name>    default: halcyon-video/halcyon-video',
    '  --out <path>           reddit-draft: where to write the draft (required)',
  ].join('\n'));
}

// ---- short, deterministic blurb (no model) ---------------------------------
// Same commit-grouping rules as tools/release-notes.mjs, trimmed to a
// one-or-two-sentence highlight instead of a full grouped changelog.

const CHORE_PATTERNS = [/^bump version to /i, /^release v\d/i];
const AREA_RE = /^([A-Z0-9][A-Za-z0-9&'/.-]*(?:\s+[A-Za-z0-9&'/.-]+){0,2}):\s+(.+)$/;

function parseSemver(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function previousTag(to) {
  const toVer = parseSemver(to);
  if (!toVer) return null;
  const tags = git(['tag', '--list', 'v*']).split('\n').map((s) => s.trim()).filter(Boolean)
    .map((t) => ({ t, v: parseSemver(t) }))
    .filter((x) => x.v && compareSemver(x.v, toVer) < 0)
    .sort((a, b) => compareSemver(b.v, a.v));
  return tags.length ? tags[0].t : null;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function commitHighlights(tag) {
  const from = previousTag(tag);
  const range = from ? `${from}..${tag}` : tag;
  const sep = '\x1e';
  let raw;
  try {
    raw = git(['log', '--no-merges', `--pretty=format:${sep}%s`, range]);
  } catch {
    return [];
  }
  return raw.split(sep).map((s) => s.trim()).filter(Boolean)
    .filter((subject) => !CHORE_PATTERNS.some((re) => re.test(subject)))
    .map((subject) => {
      const m = AREA_RE.exec(subject);
      return capitalize(m ? m[2] : subject);
    });
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** { title, blurb, url } — the raw material every channel formats to its own limit. */
function buildAnnouncement(opts) {
  const [org, name] = opts.repo.split('/');
  const title = `Halcyon Video ${opts.tag}`;
  const highlights = commitHighlights(opts.tag).slice(0, 2);
  const blurb = highlights.length ? `${highlights.join('. ')}.` : 'A new release is out.';
  const url = `https://${org}.github.io/${name}/`;
  return { title, blurb, url };
}

function composeText(maxLen, { title, blurb, url }) {
  const suffix = `\n\nTry it in a browser, no server needed: ${url}`;
  const budget = Math.max(0, maxLen - title.length - suffix.length - 1);
  return `${title}\n${truncate(blurb, budget)}${suffix}`;
}

// ---- secrets / soft-skip ----------------------------------------------------

function env(name) {
  return (process.env[name] || '').trim();
}

function requireEnv(...names) {
  const missing = names.filter((n) => !env(n));
  if (missing.length) {
    console.log(`::notice::announce-fanout: skipping — missing secret(s): ${missing.join(', ')}`);
    return null;
  }
  return Object.fromEntries(names.map((n) => [n, env(n)]));
}

async function assertOk(res, label) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label}: ${res.status} ${res.statusText} ${body.slice(0, 500)}`);
  }
  return res;
}

function readScreenshot(opts) {
  if (!opts.screenshot || !fs.existsSync(opts.screenshot)) return null;
  return fs.readFileSync(opts.screenshot);
}

// ---- channels ---------------------------------------------------------------

async function channelDiscord(opts, ann) {
  const creds = requireEnv('DISCORD_WEBHOOK_URL');
  if (!creds) return;
  const shot = readScreenshot(opts);
  const embed = { title: ann.title, description: `${ann.blurb}\n\n${ann.url}`, color: 0x2b6cb0 };
  const form = new FormData();
  if (shot) {
    embed.image = { url: 'attachment://screenshot.png' };
    form.append('files[0]', new Blob([shot], { type: 'image/png' }), 'screenshot.png');
  }
  form.append('payload_json', JSON.stringify({ embeds: [embed] }));
  await assertOk(await fetch(creds.DISCORD_WEBHOOK_URL, { method: 'POST', body: form }), 'discord');
  console.log('announce-fanout: posted to Discord');
}

async function channelMastodon(opts, ann) {
  const creds = requireEnv('MASTODON_INSTANCE', 'MASTODON_TOKEN');
  if (!creds) return;
  const base = creds.MASTODON_INSTANCE.replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${creds.MASTODON_TOKEN}` };
  let mediaIds = [];
  const shot = readScreenshot(opts);
  if (shot) {
    const form = new FormData();
    form.append('file', new Blob([shot], { type: 'image/png' }), 'screenshot.png');
    form.append('description', `${ann.title} screenshot`);
    const res = await assertOk(await fetch(`${base}/api/v2/media`, { method: 'POST', headers: auth, body: form }), 'mastodon media upload');
    const media = await res.json();
    // Images process synchronously and come back with `url` set; video/gifv
    // would come back 202 with `url: null` until processed. Poll a few times
    // regardless — cheap, and covers instances that behave differently.
    for (let i = 0; i < 5 && !media.url; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await fetch(`${base}/api/v1/media/${media.id}`, { headers: auth });
      if (poll.ok) Object.assign(media, await poll.json());
    }
    mediaIds = [media.id];
  }
  const status = composeText(500, ann);
  await assertOk(await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, media_ids: mediaIds }),
  }), 'mastodon status');
  console.log('announce-fanout: posted to Mastodon');
}

async function channelBluesky(opts, ann) {
  const creds = requireEnv('BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD');
  if (!creds) return;
  const service = env('BLUESKY_SERVICE') || 'https://bsky.social';
  const sessionRes = await assertOk(await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: creds.BLUESKY_HANDLE, password: creds.BLUESKY_APP_PASSWORD }),
  }), 'bluesky session');
  const session = await sessionRes.json();
  const auth = { Authorization: `Bearer ${session.accessJwt}` };

  let embed;
  const shot = readScreenshot(opts);
  if (shot) {
    const blobRes = await assertOk(await fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'image/png' },
      body: shot,
    }), 'bluesky blob upload');
    const { blob } = await blobRes.json();
    embed = { $type: 'app.bsky.embed.images', images: [{ image: blob, alt: ann.title }] };
  }
  const text = composeText(300, ann);
  const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), ...(embed ? { embed } : {}) };
  await assertOk(await fetch(`${service}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
  }), 'bluesky createRecord');
  console.log('announce-fanout: posted to Bluesky');
}

// Command-based v2 chunked upload (docs.x.com/x-api/media/quickstart/media-upload-chunked):
// INIT/APPEND/FINALIZE all hit the same endpoint as multipart form fields. A
// release screenshot is one small PNG — a single APPEND chunk, and no
// processing_info to poll (that only ever applies to video/gif).
async function uploadXMedia(bytes, auth) {
  const initForm = new FormData();
  initForm.append('command', 'INIT');
  initForm.append('media_type', 'image/png');
  initForm.append('media_category', 'tweet_image');
  initForm.append('total_bytes', String(bytes.length));
  const initRes = await assertOk(await fetch('https://api.x.com/2/media/upload', { method: 'POST', headers: auth, body: initForm }), 'x media init');
  const { data } = await initRes.json();
  const mediaId = data.id;

  const appendForm = new FormData();
  appendForm.append('command', 'APPEND');
  appendForm.append('media_id', mediaId);
  appendForm.append('segment_index', '0');
  appendForm.append('media', new Blob([bytes], { type: 'image/png' }), 'screenshot.png');
  await assertOk(await fetch('https://api.x.com/2/media/upload', { method: 'POST', headers: auth, body: appendForm }), 'x media append');

  const finalForm = new FormData();
  finalForm.append('command', 'FINALIZE');
  finalForm.append('media_id', mediaId);
  await assertOk(await fetch('https://api.x.com/2/media/upload', { method: 'POST', headers: auth, body: finalForm }), 'x media finalize');
  return mediaId;
}

async function channelX(opts, ann) {
  const creds = requireEnv('X_CLIENT_ID', 'X_REFRESH_TOKEN');
  if (!creds) return;
  const clientSecret = env('X_CLIENT_SECRET');
  const tokenAuth = clientSecret
    ? { Authorization: `Basic ${Buffer.from(`${creds.X_CLIENT_ID}:${clientSecret}`).toString('base64')}` }
    : {};
  const tokenRes = await assertOk(await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...tokenAuth },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.X_REFRESH_TOKEN,
      client_id: creds.X_CLIENT_ID,
    }),
  }), 'x token refresh');
  const token = await tokenRes.json();
  if (token.refresh_token && token.refresh_token !== creds.X_REFRESH_TOKEN) {
    // X rotates refresh tokens on use. A workflow has no permission to write
    // repo secrets (that needs a PAT with admin rights, which nothing here
    // holds), so the best this can do is say so loudly.
    console.log('::warning::announce-fanout: X rotated the refresh token — update the X_REFRESH_TOKEN repo secret or the next tag push will fail to authenticate');
  }
  const auth = { Authorization: `Bearer ${token.access_token}` };

  const shot = readScreenshot(opts);
  const mediaId = shot ? await uploadXMedia(shot, auth) : null;
  const body = { text: composeText(280, ann) };
  if (mediaId) body.media = { media_ids: [mediaId] };
  await assertOk(await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), 'x post');
  console.log('announce-fanout: posted to X');
}

function channelRedditDraft(opts, ann) {
  if (!opts.out) { console.error('announce-fanout: reddit-draft needs --out <path>'); process.exit(2); }
  const highlights = commitHighlights(opts.tag).slice(0, 4);
  const parts = [
    `**${ann.title} — ${ann.blurb}**`,
    '',
    'Halcyon Video is an open-source (GPL), self-hosted app that renders your own\n' +
    'Jellyfin or Plex library as a walkable 90s/2000s video rental store — browse\n' +
    'shelves, flip boxes, rent tapes, the whole bit.',
  ];
  if (highlights.length) parts.push('', highlights.map((h) => `- ${h}`).join('\n'));
  parts.push(
    '',
    `Try it in a browser, no server needed: ${ann.url}`,
    `Source: https://github.com/${opts.repo}`,
    '',
    '---',
    '',
    'Posting notes (do not automate — see GH #105):',
    '- Post to ONE subreddit at a time, never a crosspost sweep.',
    '- Stay in the thread for about an hour after posting.',
    '- Suggested order: r/selfhosted (F/LOSS-exempt from the promo rule), r/jellyfin, r/plex, r/homelab.',
    '- Reserve this for real milestones, not every tag.',
  );
  fs.writeFileSync(opts.out, `${parts.join('\n')}\n`);
  console.log(`announce-fanout: wrote Reddit draft to ${opts.out}`);
}

// ---- main ---------------------------------------------------------------

const CHANNELS = {
  discord: channelDiscord,
  mastodon: channelMastodon,
  bluesky: channelBluesky,
  x: channelX,
  'reddit-draft': channelRedditDraft,
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const fn = CHANNELS[opts.channel];
  if (!fn) {
    console.error(`announce-fanout: unknown channel "${opts.channel}" (want one of: ${Object.keys(CHANNELS).join(', ')})`);
    process.exit(2);
  }
  const ann = buildAnnouncement(opts);
  try {
    await fn(opts, ann);
  } catch (err) {
    // Fail soft, always — see the header comment.
    console.log(`::warning::announce-fanout: ${opts.channel} failed — ${err.message}`);
  }
}

main();
