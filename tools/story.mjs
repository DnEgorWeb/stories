#!/usr/bin/env node
// Story page generator — see CLAUDE.md for the workflow.
//
//   node tools/story.mjs words <text.txt> [--title "…"]
//   node tools/story.mjs build <text.txt> <dict.json> [--title "…"] [--slug …] [--lines]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = '<!-- stories:start -->';
const FONTS = 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const USAGE = `Usage:
  node tools/story.mjs words <text.txt> [--title "…"]
  node tools/story.mjs build <text.txt> <dict.json> [--title "…"] [--slug …] [--lines]`;

// Tokenizer and key normalisation — must match assets/reader.js.
const WORD = /\p{L}+(?:['’-]\p{L}+)*/gu;
const norm = (s) => s.toLowerCase().replace(/’/g, "'");

// Articles and prepositions stay untranslated by default; a dictionary entry still makes them tappable.
const SKIP = new Set(`
  a an the
  aboard about above across after against along amid among amongst around at before behind below beneath
  beside besides between beyond by despite down during except for from in inside into near of off on onto
  out outside over past per since through throughout till to toward towards under underneath until unto up
  upon via with within without
`.trim().split(/\s+/));

const PRONOUN_I = /^i(?:'[a-z]+)?$/;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lines') opts.lines = true;
    else if (a === '--title' || a === '--slug') opts[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) fail(`Unknown option ${a}\n${USAGE}`);
    else opts.positional.push(a);
  }
  return opts;
}

// Title is --title, or else the first line of the file (which is then dropped from the body).
// Blank lines separate paragraphs; single newlines become spaces unless `lines` is set.
function parseText(raw, { title, lines }) {
  let paras = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) fail('The text is empty.');
  if (!title) {
    const [first, ...rest] = paras[0].split('\n');
    title = first.trim();
    paras[0] = rest.join('\n').trim();
    if (!paras[0]) paras.shift();
  }
  paras = paras.map((p) => p.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).join(lines ? '\n' : ' '));
  return { title, paras };
}

function sentenceStart(text, i) {
  i--;
  while (i >= 0 && /[\s"'“”‘’«»()[\]*_—–-]/u.test(text[i])) i--;
  return i < 0 || /[.!?…:]/.test(text[i]);
}

// Word forms in order of first appearance. A form that is always capitalised and shows up
// mid-sentence (title case in the title doesn't count) is treated as a probable name.
function analyse(title, paras) {
  const forms = new Map();
  let total = 0;
  const scan = (text, isTitle) => {
    for (const m of text.matchAll(WORD)) {
      total++;
      const key = norm(m[0]);
      let f = forms.get(key);
      if (!f) forms.set(key, (f = { key, raw: m[0], count: 0, lower: false, midCap: false }));
      f.count++;
      if (!/^\p{Lu}/u.test(m[0])) f.lower = true;
      else if (!isTitle && !sentenceStart(text, m.index)) f.midCap = true;
    }
  };
  scan(title, true);
  paras.forEach((p) => scan(p, false));
  for (const f of forms.values()) f.name = f.midCap && !f.lower && !PRONOUN_I.test(f.key);
  return { forms: [...forms.values()], total };
}

function coverage(forms, dict) {
  const used = new Set();
  const lookup = (k) => {
    if (Object.hasOwn(dict, k)) return k;
    if (k.endsWith("'s") && Object.hasOwn(dict, k.slice(0, -2))) return k.slice(0, -2);
    return null;
  };
  const missing = [];
  let tappable = 0;
  for (const f of forms) {
    // Mirrors reader.js: a compound missing from the dictionary falls back to its parts.
    const parts = lookup(f.key) || !f.key.includes('-') ? [f.key] : f.key.split('-');
    const keys = parts.map(lookup);
    keys.forEach((k) => k && used.add(k));
    if (keys.some(Boolean)) tappable += f.count;
    if (!f.name && parts.some((p, i) => !keys[i] && !SKIP.has(p))) missing.push(f.key);
  }
  return { missing, tappable, unused: Object.keys(dict).filter((k) => !used.has(k)) };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function humanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function page(title, meta, paras, dict) {
  const entries = Object.keys(dict).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])}`);
  const json = `{\n${entries.join(',\n')}\n}`.replace(/</g, '\\u003c');
  const body = paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>\n')}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Stories</title>
<meta name="theme-color" content="#f8f4ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b1a17" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<main class="wrap">
<nav class="topbar"><a href="../">← Stories</a></nav>
<h1 class="story-title" data-words>${esc(title)}</h1>
<p class="meta">${meta}</p>
<article data-words>
${body}
</article>
</main>
<script>
window.DICT = ${json};
</script>
<script src="../assets/reader.js"></script>
</body>
</html>
`;
}

function words(file, opts) {
  const { title, paras } = parseText(readFileSync(file, 'utf8'), opts);
  const { forms, total } = analyse(title, paras);
  const todo = forms.filter((f) => !f.name && !SKIP.has(f.key));
  const names = forms.filter((f) => f.name);
  console.log(`Title: ${title}\n${total} words, ${todo.length} forms to translate:\n`);
  console.log(todo.map((f) => f.key).join(' '));
  if (names.length) console.log(`\nProbable names (left untranslated): ${names.map((f) => f.raw).join(' ')}`);
}

function build(file, dictFile, opts) {
  const { title, paras } = parseText(readFileSync(file, 'utf8'), opts);
  const dict = {};
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(dictFile, 'utf8')))) {
    dict[norm(k.trim())] = String(v).trim();
  }
  const slug = opts.slug || slugify(title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`Can't use "${slug}" as a slug; pass --slug.`);

  const { forms, total } = analyse(title, paras);
  const { missing, tappable, unused } = coverage(forms, dict);

  const indexPath = join(ROOT, 'index.html');
  let index = readFileSync(indexPath, 'utf8');
  if (!index.includes(`${MARK}\n`)) fail(`index.html has no "${MARK}" line.`);
  const itemRe = new RegExp(`^[ \\t]*<li data-slug="${slug}"[^\\n]*\\n`, 'm');
  const old = index.match(itemRe);
  // A rebuilt story keeps its original date and its place in the list.
  const iso = old?.[0].match(/data-date="(\d{4}-\d\d-\d\d)"/)?.[1] ?? today();
  const meta = `${humanDate(iso)} · ${total.toLocaleString('en-US')} words`;
  const item = `    <li data-slug="${slug}" data-date="${iso}"><a href="texts/${slug}.html"><span class="t">${esc(title)}</span><span class="m">${meta}</span></a></li>\n`;
  index = old ? index.replace(itemRe, () => item) : index.replace(`${MARK}\n`, () => `${MARK}\n${item}`);

  mkdirSync(join(ROOT, 'texts'), { recursive: true });
  writeFileSync(join(ROOT, 'texts', `${slug}.html`), page(title, meta, paras, dict));
  writeFileSync(indexPath, index);

  const names = forms.filter((f) => f.name).map((f) => f.raw);
  console.log(`Wrote texts/${slug}.html: "${title}", ${total} words, ${Math.round((100 * tappable) / total)}% tappable`);
  console.log(`${old ? 'Updated' : 'Added'} the link in index.html`);
  if (names.length) console.log(`Probable names (untranslated): ${names.join(' ')}`);
  if (unused.length) console.log(`Unused dictionary keys: ${unused.join(' ')}`);
  console.log(missing.length ? `MISSING ${missing.length}: ${missing.join(' ')}` : 'No missing words.');
}

const [cmd, ...rest] = process.argv.slice(2);
const opts = parseArgs(rest);
const [file, dictFile] = opts.positional;
if (cmd === 'words' && file) words(file, opts);
else if (cmd === 'build' && file && dictFile) build(file, dictFile, opts);
else fail(USAGE);
