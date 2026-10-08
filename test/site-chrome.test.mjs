// The one header and footer of every page (scripts/site-chrome.mjs, site/chrome/, site/nav.json, public/site.css), the navigation through every module and page, the check that every link on the
// site goes somewhere, and the homepage's destination photos.
//   node --test test/site-chrome.test.mjs
// Before this the site had 13 different headers and 15 different footers, no two alike, the logo on every Store page led to the Store instead of the home page, and no menu led to the modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACCOUNT, FOOTER, MODULES, PAGE_KEYS, PUBLIC, checkLinks, isStandalone, listPages, renderFooter, renderHeader, served, stampPage } from '../scripts/site-chrome.mjs';

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
    if (isStandalone(html)) continue;   // the Coming soon home page: one screen, no header, no footer (tested below)
    assert.equal(count(html, '<a class="tg-brand" href="/">'), 1, `${rel(file)}: header logo`);
    assert.equal(count(html, '<a class="tg-foot-brand" href="/">'), 1, `${rel(file)}: footer logo`);
    assert.equal(count(html, '<header'), 1, `${rel(file)}: one header`);
    assert.equal(count(html, '<footer'), 1, `${rel(file)}: one footer`);
  }
});

test('the top bar leads to every module, in the order of the home page, and says which ones are not finished', () => {
  const header = renderHeader('');
  assert.deepEqual(MODULES.map((m) => m.label), ['Explore', 'Travel Store', 'Trip Builder', 'Share']);
  assert.deepEqual(MODULES.map((m) => m.status ?? 'live'), ['soon', 'live', 'preview', 'soon']);
  for (const m of MODULES) assert.ok(header.includes(`<a href="${m.href}" data-nav-id="${m.key}">${m.label}${m.status ? `<span class="tg-chip">${m.status === 'soon' ? 'Soon' : 'Preview'}</span>` : ''}</a>`), m.key);
  assert.match(header, /<a class="tg-account" href="\/under-construction" data-nav-id="signin">Sign in<\/a>/, 'there is no account to sign in to yet, so Sign in goes to the page that says so');
  assert.equal(count(header, 'aria-current'), 0, 'a page that is no menu item marks none');
  assert.equal(count(header, 'tg-subnav'), 0, 'and has no second bar');
});

test('the menu marks the page you are on; inside the Travel Store the module is marked as the place and the section as the page, with the section bar shown', () => {
  for (const m of MODULES) {
    const header = renderHeader(m.key);
    assert.equal(count(header, 'aria-current="page"'), 1, m.key);
    assert.ok(header.includes(`<a href="${m.href}" aria-current="page" data-nav-id="${m.key}">`), `${m.key}: on the module's own page the module is the page`);
    assert.equal(count(header, '<nav class="tg-subnav"'), m.sections ? 1 : 0, `${m.key}: the section bar is there when the module has sections`);
    for (const s of m.sections ?? []) {
      const inside = renderHeader(s.key);
      assert.equal(count(inside, 'aria-current="page"'), 1, s.key);
      assert.ok(inside.includes(`<a href="${m.href}" aria-current="true" data-nav-id="${m.key}">`), `${s.key}: the module is the place you are in`);
      assert.ok(inside.includes(`<a href="${s.href}" aria-current="page" data-nav-id="${s.key}">`), `${s.key}: the section is the page`);
      assert.equal(count(inside, '<nav class="tg-subnav"'), 1);
      assert.equal(count(inside, 'data-nav-id'), MODULES.length + m.sections.length + 1, `${s.key}: modules, sections and Sign in`);
    }
  }
  assert.equal(count(renderHeader('trip'), 'tg-subnav'), 0, 'only the Travel Store has sections');
  assert.ok(renderHeader('account').includes('<a class="tg-account" href="/under-construction" aria-current="page" data-nav-id="signin">'), 'the account page marks Sign in');
});

test('a page may name only a menu item that exists', () => {
  assert.throws(() => renderHeader('hotles'), /not a menu item/);
  assert.ok(PAGE_KEYS.has('') && PAGE_KEYS.has('journey') && PAGE_KEYS.has('account'));
  const keys = [...MODULES.flatMap((m) => [m.key, ...(m.sections ?? []).map((s) => s.key)]), ACCOUNT.key];
  assert.equal(new Set(keys).size, keys.length, 'no two menu items share a key');
  for (const file of listPages()) {
    const html = fs.readFileSync(file, 'utf8');
    if (isStandalone(html)) continue;
    const key = /<!-- site:header page="([a-z-]*)" -->/.exec(html)?.[1];
    assert.ok(PAGE_KEYS.has(key), `${rel(file)} names "${key}"`);
  }
});

test("each menu item's own page knows it is that item, so the menu marks where you are", () => {
  const items = [...MODULES.flatMap((m) => [m, ...(m.sections ?? [])]), { key: ACCOUNT.key, href: ACCOUNT.page.href }];
  for (const item of items) {
    if (!item.href.startsWith('/')) continue;
    const file = path.join(PUBLIC, item.href.replace(/\/$/, '/index').replace(/^\//, '') + '.html');
    assert.equal(/<!-- site:header page="([a-z-]*)" -->/.exec(fs.readFileSync(file, 'utf8'))?.[1], item.key, item.href);
  }
});

test('an old page is adopted: its own skip link, header and footer are replaced, the shared ones added once, and a second stamp changes nothing', () => {
  const once = stampPage(OLD_PAGE, 'store/hotels.html');
  assert.equal(count(once, '<header'), 1);
  assert.equal(count(once, '<footer'), 1);
  assert.ok(!once.includes('old-head') && !once.includes('old-foot') && !once.includes('class="skip"'), 'nothing of the old chrome is left');
  assert.match(once, /<!-- site:header page="hotels" -->/);
  assert.ok(once.includes('<a href="/store/hotels" aria-current="page" data-nav-id="hotels">Hotels</a>'));
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
  assert.ok(again.includes('<a href="/store/food" aria-current="page" data-nav-id="food">Food</a>'));
  assert.equal(stampPage(again, 'store/index.html'), again);
});

test('Windows line endings stay Windows line endings', () => {
  const crlf = OLD_PAGE.replace(/\n/g, '\r\n');
  const once = stampPage(crlf, 'store/food.html');
  assert.ok(!/(^|[^\r])\n/.test(once), 'no bare line feed');
  assert.equal(stampPage(once, 'store/food.html'), once);
});

test('the footer is a site map: every module, every Travel Store page, the account pages, the other sites and the legal pages', () => {
  const footer = renderFooter('');
  assert.deepEqual(FOOTER.map((g) => g.title), ['Modules', 'Travel Store', 'TourGuid', 'Help and legal']);
  assert.equal(count(footer, '<nav class="tg-sitemap"'), 1, 'one landmark');
  assert.equal(count(footer, '<h2 class="tg-sm-h">'), 4);
  for (const href of [
    '/store/explore', '/store/', 'https://app.tourguid.net/trip/', '/store/community',
    '/store/hotels', '/store/flights', '/store/activities', '/store/food', '/store/places', '/store/journey-building',
    '/', '/under-construction', '/store/member-account', 'https://intro.tourguid.net/', 'https://app.tourguid.net/marketing', 'https://app.tourguid.net/docs',
    'mailto:admin@tourguid.net', 'https://app.tourguid.net/privacy', 'https://app.tourguid.net/terms', 'https://app.tourguid.net/accessibility',
  ]) assert.ok(footer.includes(`<a href="${href}">`), href);
  assert.ok(footer.includes('<a href="/store/community">Share<span class="tg-chip">Soon</span></a>'));
});

test('every page of the site can be reached from any page: through the top bar, the Travel Store bar or the site map (the listed few are reached from a button or a result)', () => {
  const REACHED_OTHERWISE = new Set(['404.html', 'under-construction.html', 'home.html', 'store/hotel.html', 'store/flight-detail.html', 'store/detail.html']);   // home.html: the real home page, at /home behind the password while / is the Coming soon page
  const linked = new Set();
  for (const key of ['', 'store']) for (const m of renderHeader(key).matchAll(/<a [^>]*href="([^"]+)"/g)) linked.add(m[1]);
  for (const m of renderFooter('').matchAll(/<a href="([^"]+)"/g)) linked.add(m[1]);
  const orphans = listPages().map(rel).filter((page) => {
    if (REACHED_OTHERWISE.has(page) || page === 'index.html') return false;
    const route = '/' + page.replace(/index\.html$/, '').replace(/\.html$/, '');
    return ![route, route + '/'].some((r) => linked.has(r));
  });
  assert.deepEqual(orphans, [], 'add the page to site/nav.json, or to this list with the reason it is reached another way');
});

test('every address in the navigation that leaves this site is one we know, and a module that says Soon leads to a page that says it is under construction', () => {
  const KNOWN = [/^https:\/\/app\.tourguid\.net\/(trip\/|marketing|docs|privacy|terms|accessibility)$/, /^https:\/\/intro\.tourguid\.net\/$/, /^mailto:admin@tourguid\.net$/];
  const all = [...MODULES.flatMap((m) => [m, ...(m.sections ?? [])]), ACCOUNT, ...FOOTER.flatMap((g) => g.links)];
  for (const item of all) if (!item.href.startsWith('/')) assert.ok(KNOWN.some((re) => re.test(item.href)), item.href);
  for (const m of MODULES) {
    if (m.href.startsWith('/')) {
      const file = path.join(PUBLIC, m.href.replace(/\/$/, '/index').replace(/^\//, '') + '.html');
      const page = fs.readFileSync(file, 'utf8');
      assert.equal(/under construction/i.test(page.replace(/<!-- site:[\s\S]*?-->/g, '')), m.status === 'soon', `${m.key}: Soon on the menu, "under construction" on the page, and neither without the other`);
    }
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

test('an address that is not a page gets a page: 404.html, root-relative whatever address was mistyped, kept out of search, and the Worker is told to serve it', () => {
  // Until 2026-10-04 tourguid.net answered such an address with status 404 and an EMPTY body (Content-Length: 0): a white screen with no way out.
  const html = fs.readFileSync(path.join(PUBLIC, '404.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.equal(count(html, '<a class="tg-brand" href="/">'), 1, 'it carries the shared header');
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const ref of refs) assert.match(ref, /^(\/|https:\/\/|mailto:|#)/, `${ref} would break at /store/hotle or /a/b/c`);
  const config = fs.readFileSync(path.join(PUBLIC, '..', 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(config, /"not_found_handling":\s*"404-page"/);
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
  const html = fs.readFileSync(path.join(PUBLIC, 'home.html'), 'utf8');
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
  const html = fs.readFileSync(path.join(PUBLIC, 'home.html'), 'utf8');
  const cards = [...html.matchAll(/<a class="dest-card (dest-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cards, ['dest-paris', 'dest-rome', 'dest-barcelona', 'dest-tokyo', 'dest-newyork', 'dest-bangkok']);
});

test('the Coming soon home page is the one page that stands alone: no header, no footer, no script, no form, and exactly two ways in, each to a place that exists', () => {
  const standalone = listPages().filter((file) => isStandalone(fs.readFileSync(file, 'utf8'))).map(rel);
  assert.deepEqual(standalone, ['index.html'], 'the escape hatch is for the home page and nothing else');
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.equal(stampPage(html, 'index.html'), html, 'the generator leaves it alone');
  assert.doesNotMatch(html, /<header|<footer|<script|<form|<input|\son[a-z]+=/i, 'one screen of markup and styles: the page policy lets nothing be submitted from here, and no script runs');
  const links = [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').trim()]);
  assert.deepEqual(links, [
    ['https://app.tourguid.net/trip/#/trips', 'Log in'],          // the login is kept on app.tourguid.net (its cookie, its rate limits, its security check); a form here could not reach it
    ['https://intro.tourguid.net/#test', 'Create an account'],    // accounts are made in the app, and this is where a new person signs up to download and test it
    ['https://app.tourguid.net/privacy', 'Privacy'],
    ['https://app.tourguid.net/terms', 'Terms'],
    ['https://app.tourguid.net/accessibility', 'Accessibility'],
    ['mailto:admin@tourguid.net', 'Support'],
  ]);
  assert.match(html, /<h1>COMING SOON!<\/h1>/, 'the page that was the home page before the real one went live, back as it was');
  assert.match(html, /<link rel="canonical" href="https:\/\/tourguid\.net\/">/);
  assert.doesNotMatch(html, /robots[^>]*noindex/i, 'the public front page stays indexable');
});
