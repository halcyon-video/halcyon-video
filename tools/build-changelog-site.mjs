#!/usr/bin/env node
// Builds the hosted changelog: one page per release plus an index, from the
// written notes and pictures in docs/releases/ and the generated entries in
// CHANGELOG.md. deploy-demo.yml runs it after the app build so the pages ship
// beside the browser demo at <site>/changelog/, and the Discord release post
// links the release's own page (tools/announce-fanout.mjs).
//
//   node tools/build-changelog-site.mjs --out dist/changelog [--repo owner/name]
//
// Pictures for a release, all optional:
//   docs/releases/<tag>.jpg|png   the headline shot (also what announce.yml posts)
//   docs/releases/<tag>/*.jpg|png every other shot, shown in file-name order
//   <tag>/<name>.txt beside a shot is used as its caption
// A notes file that embeds one of these by its raw.githubusercontent URL gets
// the local copy instead, so the page never depends on GitHub serving images.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releasesDir = path.join(root, 'docs', 'releases');
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

function parseArgs(argv) {
  const opts = { out: null, repo: 'halcyon-video/halcyon-video' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--repo') opts.repo = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!opts.out) throw new Error('usage: build-changelog-site.mjs --out <dir> [--repo owner/name]');
  return opts;
}

function compareTags(a, b) {
  const pa = a.slice(1).split('.').map(Number);
  const pb = b.slice(1).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  return 0;
}

// ---- sources -----------------------------------------------------------------

/** CHANGELOG.md sections keyed by tag: { date, body }. */
function readChangelog() {
  const file = path.join(root, 'CHANGELOG.md');
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  const parts = fs.readFileSync(file, 'utf8').split(/^## /m).slice(1);
  for (const part of parts) {
    const m = /^\[(v\d+\.\d+\.\d+)\](?:\s*[—-]\s*(\d{4}-\d{2}-\d{2}))?[^\n]*\n([\s\S]*)$/.exec(part);
    if (!m) continue;
    // The generator files the CHANGELOG commit itself under a "CHANGELOG"
    // group; it says nothing about the release, so it never reaches the page.
    const body = m[3].replace(/^### CHANGELOG\n(?:- .*\n?)*/m, '').trim();
    out.set(m[1], { date: m[2] || null, body });
  }
  return out;
}

function releaseTags(changelog) {
  const tags = new Set(changelog.keys());
  for (const name of fs.existsSync(releasesDir) ? fs.readdirSync(releasesDir) : []) {
    const m = /^(v\d+\.\d+\.\d+)(?:\.(?:md|jpe?g|png|webp))?$/.exec(name);
    if (m) tags.add(m[1]);
  }
  return [...tags].sort(compareTags);
}

function releasePictures(tag) {
  const pics = [];
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(releasesDir, `${tag}.${ext}`);
    if (fs.existsSync(f)) { pics.push({ src: f, name: `${tag}.${ext}`, caption: null }); break; }
  }
  const dir = path.join(releasesDir, tag);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const name of fs.readdirSync(dir).filter((n) => IMAGE_RE.test(n)).sort()) {
      const captionFile = path.join(dir, name.replace(IMAGE_RE, '.txt'));
      const caption = fs.existsSync(captionFile) ? fs.readFileSync(captionFile, 'utf8').trim() : null;
      pics.push({ src: path.join(dir, name), name, caption });
    }
  }
  return pics;
}

// ---- markdown ----------------------------------------------------------------
// Only what docs/releases and CHANGELOG.md actually use: headings, bullet
// lists, paragraphs, **bold**, `code`, links and images. Everything is
// escaped first, so the notes can never inject markup into the page.

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeUrl(url) {
  return /^(https?:\/\/|\.{0,2}\/|[\w.-]+(\/|$))/i.test(url) && !/^javascript:/i.test(url) ? url : '#';
}

function inline(text, rewrite) {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
      `<img src="${safeUrl(rewrite(url))}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${safeUrl(url)}">${label}</a>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(md, rewrite = (u) => u) {
  const html = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) html.push(`<p>${inline(para.join(' '), rewrite)}</p>`); para = []; };
  const flushList = () => { if (list) html.push(`<ul>${list.map((li) => `<li>${inline(li, rewrite)}</li>`).join('')}</ul>`); list = null; };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (!line.trim()) { flushPara(); flushList(); }
    else if (heading) { flushPara(); flushList(); const level = Math.min(heading[1].length + 1, 4); html.push(`<h${level}>${inline(heading[2], rewrite)}</h${level}>`); }
    else if (image) { flushPara(); flushList(); html.push(`<figure>${inline(line.trim(), rewrite)}${image[1] ? `<figcaption>${escapeHtml(image[1])}</figcaption>` : ''}</figure>`); }
    else if (item) { flushPara(); (list ||= []).push(item[1]); }
    else if (list && /^\s{2,}\S/.test(raw)) list[list.length - 1] += ` ${line.trim()}`;
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return html.join('\n');
}

// ---- pages -------------------------------------------------------------------

// Styled after a mid-90s video-store home page (owner reference, 2026-10-13):
// black page, Times, a banner shot with the store's badge, orange underlined
// links behind blue squares, thumbnail rows, a red rule over the footer.
const CSS = `
* { box-sizing: border-box; }
html, body { background: #000; }
body { margin: 0; color: #fff; font: 18px/1.45 "Times New Roman", Times, serif; }
.page { max-width: 560px; margin: 0 auto; padding-bottom: 24px; }
a { color: #ff9933; }
a:hover { color: #ffcc66; }
.banner { position: relative; display: block; }
.banner .shot { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
.banner .badge { position: absolute; left: 3%; top: 5%; width: 36%; transform: rotate(-5deg); filter: drop-shadow(3px 4px 0 rgba(0, 0, 0, .65)); }
.inner { padding: 0 14px; }
h1 { font-weight: normal; font-size: 26px; line-height: 1.2; text-transform: uppercase; text-align: center; margin: 22px 0 12px; }
nav { text-align: center; line-height: 1.6; margin: 0 0 18px; }
nav a { white-space: nowrap; margin: 0 3px; }
nav a::before, summary::before { content: ""; display: inline-block; width: .55em; height: .55em; background: #3333ff; margin-right: 2px; }
hr { border: 0; border-top: 1px solid #6b6b6b; margin: 18px 0; }
.dateline { font-size: 16px; margin: 0 0 14px; }
.intro { text-align: center; }
h2, h3 { font-weight: normal; text-transform: uppercase; letter-spacing: .04em; font-size: 20px; margin: 26px 0 8px; }
ul { padding-left: 22px; list-style: square; }
li { margin: 6px 0; }
li::marker { color: #3333ff; }
code { font-family: "Courier New", Courier, monospace; font-size: 16px; }
img { max-width: 100%; height: auto; }
figure { margin: 16px 0; }
figure img, .rel img { display: block; border: 1px solid #9a9a9a; }
figcaption { font-size: 15px; margin-top: 4px; }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
.shots figure { margin: 0; }
details { margin: 22px 0; }
summary { cursor: pointer; color: #ff9933; text-decoration: underline; list-style: none; }
summary::-webkit-details-marker { display: none; }
.rel { display: flex; gap: 14px; align-items: flex-start; margin: 0 0 22px; }
.rel > a:first-child { flex: none; width: 132px; }
.rel img { width: 100%; }
.rel p { margin: 4px 0 0; }
.ver { text-transform: uppercase; }
.new { color: #ffff00; font-weight: bold; font-size: 16px; }
.date { font-size: 16px; }
footer { border-top: 1px solid #cc0000; margin: 26px 14px 0; padding-top: 8px; font-size: 15px; line-height: 1.35; text-align: center; }
`;

function page({ title, heading, description, image, url, banner, body, links }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<style>${CSS}</style>
</head>
<body>
<div class="page">
<a class="banner" href="${links.index}"><img class="shot" src="${escapeHtml(banner.src)}" alt="${escapeHtml(banner.alt)}"><img class="badge" src="${links.badge}" alt="Halcyon Video"></a>
<div class="inner">
<h1>${escapeHtml(heading)}</h1>
<nav><a href="${links.index}">All Releases</a> <a href="${links.demo}">Try the Store</a> <a href="${links.repo}/releases/latest">Downloads</a></nav>
<hr>
${body}
</div>
<footer>Halcyon Video is free and open source software.<br><a href="${links.repo}">Source code and downloads</a> are on GitHub.</footer>
</div>
</body>
</html>
`;
}

/** First paragraph of the written notes, as plain text, for cards and link previews. */
function summaryOf(md) {
  for (const block of md.split(/\n\s*\n/)) {
    const text = block.trim();
    if (text && !/^(#|!\[|[-*]\s)/.test(text)) return text.replace(/\s+/g, ' ').replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  }
  return null;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [org, name] = opts.repo.split('/');
  const site = `https://${org}.github.io/${name}`;
  const repo = `https://github.com/${opts.repo}`;
  const changelog = readChangelog();
  const tags = releaseTags(changelog);
  fs.rmSync(opts.out, { recursive: true, force: true });
  fs.mkdirSync(opts.out, { recursive: true });

  // Site art: the store's badge (the app icon's sign, without its tile) and
  // the aisle shot for pages whose release has no headline picture.
  const icon = fs.readFileSync(path.join(root, 'src-tauri', 'icons', 'app-icon.svg'), 'utf8');
  const badge = icon.replace(/<rect\b[^>]*id="rect1"[^>]*\/>/, '')
    .replace(/width="1024"\s+height="1024"\s+viewBox="0 0 1024 1024"/, 'width="920" height="480" viewBox="52 272 920 480"');
  if (badge === icon) console.log('::warning::build-changelog-site: app-icon.svg changed shape; the banner badge keeps its tile');
  fs.writeFileSync(path.join(opts.out, 'halcyon-badge.svg'), badge);
  fs.copyFileSync(path.join(root, 'public', 'social-preview.jpg'), path.join(opts.out, 'banner.jpg'));

  const cards = [];
  for (const [i, tag] of tags.entries()) {
    const dir = path.join(opts.out, tag);
    fs.mkdirSync(dir, { recursive: true });
    const notesFile = path.join(releasesDir, `${tag}.md`);
    let notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').replace(/^# .*\n/, '') : null;
    const entry = changelog.get(tag);
    const pictures = releasePictures(tag);
    for (const pic of pictures) fs.copyFileSync(pic.src, path.join(dir, pic.name));

    // The headline shot always leads the page, so an embed of it further
    // down the notes is lifted out (its alt text becomes the caption).
    const hero = pictures[0] || null;
    if (hero && notes) {
      notes = notes.replace(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/gm, (line, alt, url) => {
        if (!url.endsWith(`/docs/releases/${hero.name}`)) return line;
        hero.caption ||= alt || null;
        return '';
      });
    }

    // Notes embed their other pictures by raw.githubusercontent URL at the
    // tag; point those at the copy beside the page and don't show them twice.
    const embedded = new Set();
    const rewrite = (url) => {
      const m = /\/docs\/releases\/(.+)$/.exec(url);
      if (!m) return url;
      const local = m[1].startsWith(`${tag}/`) ? m[1].slice(tag.length + 1) : m[1];
      if (!pictures.some((p) => p.name === local)) return url;
      embedded.add(local);
      return local;
    };
    const notesHtml = notes ? renderMarkdown(notes, rewrite) : '';
    const gallery = pictures.slice(1).filter((p) => !embedded.has(p.name));
    const version = tag.slice(1);
    const summary = (notes && summaryOf(notes)) || `Everything that changed in Halcyon Video ${version}.`;

    const older = tags[i + 1];
    const newer = tags[i - 1];
    const body = [
      `<p class="dateline">${entry?.date ? `Released ${formatDate(entry.date)}` : `Version ${escapeHtml(version)}`}${hero?.caption ? `<br>Pictured above: ${escapeHtml(hero.caption)}` : ''}</p>`,
      notesHtml,
      gallery.length
        ? `<h2>See it in action!</h2><div class="shots">${gallery.map((p) =>
          `<figure><a href="${p.name}"><img src="${p.name}" alt="${escapeHtml(p.caption || '')}" loading="lazy"></a>${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`
        : '',
      entry?.body
        ? (notes
          ? `<details><summary>Click here for every change in ${escapeHtml(version)}!</summary>${renderMarkdown(entry.body)}</details>`
          : `<h2>What changed</h2>${renderMarkdown(entry.body)}`)
        : '',
      older || newer
        ? `<hr><nav>${newer ? `<a href="../${newer}/">Newer: ${escapeHtml(newer.slice(1))}</a> ` : ''}${older ? `<a href="../${older}/">Older: ${escapeHtml(older.slice(1))}</a>` : ''}</nav>`
        : '',
    ].filter(Boolean).join('\n');

    const html = page({
      title: `Halcyon Video ${version}: what's new`,
      heading: `New in Halcyon Video ${version}!`,
      description: summary,
      image: hero ? `${site}/changelog/${tag}/${hero.name}` : `${site}/social-preview.jpg`,
      url: `${site}/changelog/${tag}/`,
      banner: hero ? { src: hero.name, alt: hero.caption || `Halcyon Video ${version}` } : { src: '../banner.jpg', alt: 'The Halcyon Video store' },
      body,
      links: { index: '../', demo: '../../', repo, badge: '../halcyon-badge.svg' },
    });
    fs.writeFileSync(path.join(dir, 'index.html'), html);

    cards.push(`<div class="rel">${hero ? `<a href="${tag}/"><img src="${tag}/${hero.name}" alt="" loading="lazy"></a>` : ''}<div><a class="ver" href="${tag}/">Version ${escapeHtml(version)}</a>${i === 0 ? ' <span class="new">NEW!</span>' : ''}${entry?.date ? `<br><span class="date">${formatDate(entry.date)}</span>` : ''}<p>${escapeHtml(summary)}</p></div></div>`);
  }

  const index = page({
    title: "Halcyon Video: what's new",
    heading: "What's New at Halcyon Video!",
    description: 'Every Halcyon Video release, with what changed and pictures of it.',
    image: `${site}/social-preview.jpg`,
    url: `${site}/changelog/`,
    banner: { src: 'banner.jpg', alt: 'The Halcyon Video store' },
    body: `<p class="intro">Bookmark this page and check back for every new release! Each one has its own page with pictures and every change.</p>\n<hr>\n${cards.join('\n')}`,
    links: { index: './', demo: '../', repo, badge: 'halcyon-badge.svg' },
  });
  fs.writeFileSync(path.join(opts.out, 'index.html'), index);
  console.log(`build-changelog-site: ${tags.length} release pages in ${opts.out}`);
}

main();
