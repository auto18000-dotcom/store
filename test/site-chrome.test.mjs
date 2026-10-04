// The one header and footer of every page (scripts/site-chrome.mjs, site/chrome/, public/site.css), the check that every link on the site goes somewhere, and the homepage's destination photos.
//   node --test test/site-chrome.test.mjs
// Before this the site had 13 different headers and 15 different footers, no two alike, and the logo on every Store page led to the Store instead of the home page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAV, PUBLIC, checkLinks, listPages, renderFooter, renderHeader, served, stampPage } from '../scripts/site-chrome.mjs';

const rel = (file) => path.relative(PUBLIC, file).split(path.sep).join('/');
const count = (text, needle) => text.split(needle).length - 1;

/** A page the way the Store's pages used to begin: their own skip link, header and footer, and nothing shared. */
const OLD_PAGE = [
  '<!doctype html><html><head><title>Old</title></head><body>',
  '<a class="skip" href="#main">Skip to main content</a>',
  '<header class="old-head"><a href="/store/">TourGuid</a></header>',
  '<main id="main">Hello</main>',
  '<footer class="old-foot">Old footer</footer>',
  '</body></html>',
].join('\n');

test('every page of the site carries exactly the shared header and footer, byte for byte', () => {
  const pages = listPages();
  const names = pages.map(rel);
  assert.ok(names.includes('index.html') && names.includes('store/index.html'), `the pages found: ${names.join(', ')}`);
  const differ = pages.filter((file) => { const html = fs.readFileSync(file, 'utf8'); return stampPage(html, rel(file)) !== html; }).map(rel);
  assert.deepEqual(differ, [], 'run: node scripts/site-chrome.mjs');
});

test('the logo in the header and in the footer of every page leads to the home page, and there is one of each', () => {
  for (const file of listPages()) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(count(html, '<a class="tg-brand" href="/">'), 1, `${rel(file)}: header logo`);
    assert.equal(count(html, '<a class="tg-foot-brand" href="/">'), 1, `${rel(file)}: footer logo`);
    assert.equal(count(html, '<header'), 1, `${rel(file)}: one header`);
    assert.equal(count(html, '<footer'), 1, `${rel(file)}: one footer`);
  }
});

test('the menu marks the page you are on, and only that one; a page with no place in the menu marks none', () => {
  for (const item of NAV) {
    const header = renderHeader(item.key);
    assert.equal(count(header, 'aria-current="page"'), 1, item.key);
    assert.match(header, new RegExp(`<a href="${item.href}" aria-current="page">${item.label}</a>`), item.key);
  }
  assert.equal(count(renderHeader(''), 'aria-current'), 0);
  assert.deepEqual(NAV.map((n) => n.label), ['Travel Store', 'Hotels', 'Flights', 'Activities', 'Food', 'Places']);
  assert.match(renderHeader(''), /<a class="tg-account" href="\/under-construction">Sign in<\/a>/, 'there is no account to sign in to yet, so Sign in goes to the page that says so');
});

test('an old page is adopted: its own skip link, header and footer are replaced, the shared ones added once, and a second stamp changes nothing', () => {
  const once = stampPage(OLD_PAGE, 'store/hotels.html');
  assert.equal(count(once, '<header'), 1);
  assert.equal(count(once, '<footer'), 1);
  assert.ok(!once.includes('old-head') && !once.includes('old-foot') && !once.includes('class="skip"'), 'nothing of the old chrome is left');
  assert.match(once, /<!-- site:header page="hotels" -->/);
  assert.ok(once.includes('<a href="/store/hotels" aria-current="page">Hotels</a>'));
  assert.equal(count(once, 'aria-current="page"'), 1);
  assert.equal(count(once, '<link rel="stylesheet" href="/site.css">'), 1, 'the stylesheet they are drawn with');
  assert.ok(once.includes('<main id="main">Hello</main>'), 'the page itself is untouched');
  assert.equal(stampPage(once, 'store/hotels.html'), once);
});

test('a page with no header at all gets one straight after <body>, and no stylesheet link is added twice', () => {
  const bare = '<!doctype html><html><head><title>Bare</title><link rel="stylesheet" href="/site.css"></head><body>\n<p>Hi</p>\n</body></html>';
  const stamped = stampPage(bare, 'under-construction.html');
  assert.ok(stamped.indexOf('<header') > stamped.indexOf('<body>') && stamped.indexOf('<header') < stamped.indexOf('<p>Hi</p>'));
  assert.equal(count(stamped, 'site.css'), 1);
  assert.equal(stampPage(stamped, 'under-construction.html'), stamped);
});

test("a page keeps its own part of the footer, and the menu key its marker names, through every re-stamp", () => {
  const html = stampPage(OLD_PAGE, 'store/index.html')
    .replace('<!-- site:footer-extra --><p class="tg-foot-note">', '<!-- site:footer-extra --><p class="mine">Mine</p><p class="tg-foot-note">')
    .replace('page="store"', 'page="food"');
  const again = stampPage(html, 'store/index.html');
  assert.equal(count(again, '<p class="mine">Mine</p>'), 1);
  assert.match(again, /<!-- site:header page="food" -->/, 'the marker is the truth after adoption, not the table of the script');
  assert.ok(again.includes('<a href="/store/food" aria-current="page">Food</a>'));
  assert.equal(stampPage(again, 'store/index.html'), again);
});

test('Windows line endings stay Windows line endings', () => {
  const crlf = OLD_PAGE.replace(/\n/g, '\r\n');
  const once = stampPage(crlf, 'store/food.html');
  assert.ok(!/(^|[^\r])\n/.test(once), 'no bare line feed');
  assert.equal(stampPage(once, 'store/food.html'), once);
});

test('the footer names the same four places everywhere', () => {
  const footer = renderFooter('');
  for (const href of ['/store/', 'https://intro.tourguid.net/', 'https://app.tourguid.net/privacy', 'https://app.tourguid.net/terms', 'https://app.tourguid.net/accessibility', 'mailto:admin@tourguid.net']) {
    assert.ok(footer.includes(`href="${href}"`), href);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------- links

/** A small site on disk to check links in: pages, a folder with an index, a file and a heading id. */
function miniSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-chrome-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test('served: a file, a page by its clean address, a folder with an index, and the Worker\'s own routes; nothing else', () => {
  const dir = miniSite({ 'index.html': '<p>home</p>', 'about.html': '<p>about</p>', 'store/index.html': '<p>store</p>', 'logo.svg': '<svg/>' });
  try {
    for (const ok of ['/', '/about', '/about.html', '/store/', '/store', '/logo.svg', '/api/store/suggest']) assert.equal(served(ok, dir), true, ok);
    for (const bad of ['/missing', '/store/missing', '/logo', '/about/x']) assert.equal(served(bad, dir), false, bad);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkLinks finds a dead link, a dead image, a heading that is not there, and a link that names this site in full; it lets the rest pass', () => {
  const dir = miniSite({
    'index.html': [
      '<!doctype html><html><head><link rel="canonical" href="https://tourguid.net/"></head><body>',
      '<a href="/store/">store</a> <a href="/about#team">team</a> <a href="/about#nobody">nobody</a> <a href="/missing">gone</a>',
      '<a href="#">top</a> <a href="mailto:a@b.c">mail</a> <a href="https://elsewhere.example/x">out</a> <a href="https://tourguid.net/about">in full</a>',
      '<img src="/gone.png" alt=""> <img src="/logo.svg" alt="">',
      '<!-- <a href="/commented-out">not a link</a> -->',
      '</body></html>',
    ].join('\n'),
    'about.html': '<h2 id="team">Team</h2>',
    'store/index.html': '<p>store</p>',
    'logo.svg': '<svg/>',
  });
  try {
    const { problems, warnings, externals } = checkLinks(dir);
    assert.deepEqual(problems.map((p) => p.replace(/^index\.html: /, '')).sort(), [
      '/about#nobody points at an id that is not on the page',
      '/gone.png goes nowhere (/gone.png)',
      '/missing goes nowhere (/missing)',
    ]);
    assert.deepEqual(warnings, ['index.html: https://tourguid.net/about names this site; write it root-relative']);
    assert.deepEqual(externals, ['https://elsewhere.example/x']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every link, image and script on the real site goes to something that exists', () => {
  const { problems } = checkLinks();
  assert.deepEqual(problems, []);
});

// ------------------------------------------------------------------------------------------------------------ the destination photos

/** The width and height written in a JPEG file's own header (its first frame marker). */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b[0], 0xff, `${file} is not a JPEG`);
  let i = 2;
  while (i < b.length) {
    assert.equal(b[i], 0xff, `${file}: lost the marker at ${i}`);
    const marker = b[i + 1];
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error(`${file}: no frame header`);
}

test('the homepage never tells the browser a photo is a different shape from the file: width and height attributes equal the JPEG\'s own', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((tag) => /src="\.\/assets\/photos\/[^"]+\.jpg"/.test(tag));
  const grid = /<div class="dest-grid">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  const dest = imgs.filter((tag) => grid.includes(tag));
  assert.equal(dest.length, 6, 'the six destinations');
  for (const tag of imgs) {
    const src = /src="\.\/([^"]+)"/.exec(tag)[1];
    const w = /\swidth="(\d+)"/.exec(tag)?.[1];
    const h = /\sheight="(\d+)"/.exec(tag)?.[1];
    if (!w || !h) { assert.ok(!dest.includes(tag), `${src}: the destination photos carry their size`); continue; }
    assert.deepEqual(jpegSize(path.join(PUBLIC, src)), { width: Number(w), height: Number(h) }, src);
  }
});

test('the destination tiles are no taller than they are wide, and the photo fills the tile by cropping, never by stretching', () => {
  // The owner, 2026-10-04: "photos on Explore Popular Destination ... out of proportion - stretched height". The tiles were 4:5.
  const css = fs.readFileSync(path.join(PUBLIC, 'landing.css'), 'utf8');
  const tile = /\.dest-card\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const ratio = /aspect-ratio:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(tile);
  assert.ok(ratio, 'the tile has an aspect ratio');
  assert.ok(Number(ratio[1]) >= Number(ratio[2]), `the tile is ${ratio[1]}:${ratio[2]}; taller than wide stretches the landmarks`);
  const photo = /\.dest-card img\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(photo, /object-fit:\s*cover/);
  assert.match(photo, /width:\s*100%/);
  assert.match(photo, /height:\s*100%/);
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const cards = [...html.matchAll(/<a class="dest-card (dest-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cards, ['dest-paris', 'dest-rome', 'dest-barcelona', 'dest-tokyo', 'dest-newyork', 'dest-bangkok']);
});
