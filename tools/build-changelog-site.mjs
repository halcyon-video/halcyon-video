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

const CSS = `
:root { color-scheme: dark; --ink: #f2efe6; --dim: #b9c3d6; --blue: #2b6cb0; --gold: #f2c14e; --bg: #0d1626; --card: #15223a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--gold); }
header.site { background: var(--blue); border-bottom: 4px solid var(--gold); }
header.site .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; padding-bottom: 14px; }
header.site a.brand { color: #fff; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; text-decoration: none; font-size: 18px; }
.wrap { max-width: 820px; margin: 0 auto; padding: 0 18px; }
.cta { display: inline-block; background: var(--gold); color: #10213b; font-weight: 700; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 16px; }
h1 { font-size: 32px; line-height: 1.2; margin: 28px 0 4px; }
h2 { font-size: 23px; margin: 30px 0 8px; }
h3 { font-size: 19px; margin: 22px 0 6px; color: var(--dim); }
.date { color: var(--dim); margin: 0 0 18px; font-size: 16px; }
img { max-width: 100%; height: auto; display: block; border-radius: 6px; }
figure { margin: 18px 0; }
figcaption { color: var(--dim); font-size: 15px; margin-top: 6px; }
ul { padding-left: 22px; }
li { margin: 6px 0; }
code { background: #22324f; padding: 1px 5px; border-radius: 4px; font-size: 15px; }
.gallery { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.gallery figure { margin: 0; }
details { background: var(--card); border-radius: 8px; padding: 12px 16px; margin: 26px 0; }
summary { cursor: pointer; font-weight: 700; font-size: 18px; }
.release { display: block; background: var(--card); border-radius: 10px; overflow: hidden; margin: 22px 0; color: inherit; text-decoration: none; }
.release img { border-radius: 0; aspect-ratio: 16 / 9; object-fit: cover; width: 100%; }
.release .body { padding: 14px 18px 18px; }
.release h2 { margin: 0 0 2px; }
.release p { margin: 8px 0 0; }
footer { color: var(--dim); font-size: 15px; padding: 30px 0 40px; }
`;

function page({ title, description, image, url, body, links }) {
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
<header class="site"><div class="wrap"><a class="brand" href="${links.index}">Halcyon Video</a><a class="cta" href="${links.demo}">Try the store</a></div></header>
<main class="wrap">
${body}
</main>
<footer class="wrap">Halcyon Video is free and open source. <a href="${links.repo}">Source and downloads</a>.</footer>
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

  const cards = [];
  for (const tag of tags) {
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

    const body = [
      `<p><a href="../">All releases</a></p>`,
      `<h1>Halcyon Video ${escapeHtml(version)}</h1>`,
      entry?.date ? `<p class="date">Released ${formatDate(entry.date)}</p>` : '',
      hero ? `<figure><img src="${hero.name}" alt="${escapeHtml(hero.caption || `Halcyon Video ${version}`)}">${hero.caption ? `<figcaption>${escapeHtml(hero.caption)}</figcaption>` : ''}</figure>` : '',
      notesHtml,
      gallery.length
        ? `<h2>Screenshots</h2><div class="gallery">${gallery.map((p) =>
          `<figure><a href="${p.name}"><img src="${p.name}" alt="${escapeHtml(p.caption || '')}" loading="lazy"></a>${p.caption ? `<figcaption>${escapeHtml(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`
        : '',
      entry?.body
        ? (notes
          ? `<details><summary>Every change in ${escapeHtml(version)}</summary>${renderMarkdown(entry.body)}</details>`
          : `<h2>What changed</h2>${renderMarkdown(entry.body)}`)
        : '',
    ].filter(Boolean).join('\n');

    const html = page({
      title: `Halcyon Video ${version}: what's new`,
      description: summary,
      image: hero ? `${site}/changelog/${tag}/${hero.name}` : `${site}/social-preview.jpg`,
      url: `${site}/changelog/${tag}/`,
      body,
      links: { index: '../', demo: '../../', repo },
    });
    fs.writeFileSync(path.join(dir, 'index.html'), html);

    cards.push(`<a class="release" href="${tag}/">${hero ? `<img src="${tag}/${hero.name}" alt="" loading="lazy">` : ''}<div class="body"><h2>${escapeHtml(version)}</h2>${entry?.date ? `<div class="date">${formatDate(entry.date)}</div>` : ''}<p>${escapeHtml(summary)}</p></div></a>`);
  }

  const index = page({
    title: "Halcyon Video: what's new",
    description: 'Every Halcyon Video release, with what changed and pictures of it.',
    image: `${site}/social-preview.jpg`,
    url: `${site}/changelog/`,
    body: `<h1>What's new</h1>\n<p class="date">Every release of Halcyon Video, newest first.</p>\n${cards.join('\n')}`,
    links: { index: './', demo: '../', repo },
  });
  fs.writeFileSync(path.join(opts.out, 'index.html'), index);
  console.log(`build-changelog-site: ${tags.length} release pages in ${opts.out}`);
}

main();
