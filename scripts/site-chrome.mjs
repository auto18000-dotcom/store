// One header and one footer for every page of tourguid.net, the navigation through every module and page, and a check that every link on the site goes somewhere.
//
//   node scripts/site-chrome.mjs           put the header and the footer (site/chrome/) into every page of public/, and rewrite what differs
//   node scripts/site-chrome.mjs --check   change nothing; exit 1 if any page's header or footer differs from site/chrome/ and site/nav.json, if a page names a menu item that does not exist, or if a link goes nowhere
//
// Why this exists: the site had 13 different headers and 15 different footers, no two alike, the logo on every Store page led to the Store and not to the home page, and no menu led to
// the modules (Explore, Trip Builder, Share). The pages are static HTML served as they are (no build, no templates), so the shared parts are written INTO each page between markers, and
// this script is the only thing that edits between them:
//
//   <!-- site:header page="hotels" -->   ...the header...   <!-- /site:header -->        page = which menu item (a site/nav.json key) this page is; "" for none
//   <!-- site:footer -->                 ...the footer...   <!-- /site:footer -->
//   inside the footer, <!-- site:footer-extra -->...<!-- /site:footer-extra --> is the page's OWN part (photo credits, a back link) and is kept as it is.
//
// The modules, their sections and the site map are in site/nav.json (one list; React can import it). The two partials are site/chrome/header.html and footer.html.
// A page with neither marker and an old <header>/<footer> is adopted: the old one is replaced.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC = join(ROOT, 'public');
const SITE = 'https://tourguid.net';

// ------------------------------------------------------------------------------------------------------------------------------------ the navigation model

const model = JSON.parse(readFileSync(join(ROOT, 'site', 'nav.json'), 'utf8'));
/** The top-bar modules: { key, label, href, status?, sections? }. */
export const MODULES = model.modules;
/** The account button at the right of the top bar, and the account page that stands behind it. */
export const ACCOUNT = model.account;
/** What the small label beside a module says. A module with no status is live. */
export const STATUS_WORD = { soon: 'Soon', preview: 'Preview' };

/** Every menu item that a page's marker may name, with the module it belongs to. */
const ITEMS = new Map();
for (const m of MODULES) {
  ITEMS.set(m.key, { ...m, module: m });
  for (const s of m.sections ?? []) ITEMS.set(s.key, { ...s, module: m, isSection: true });
}
ITEMS.set(ACCOUNT.key, { key: ACCOUNT.key, label: ACCOUNT.label, href: ACCOUNT.href, module: null });
/** Keys a page may put in its header marker. The empty string is a page that is no menu item (the home page, the 404 page). */
export const PAGE_KEYS = new Set(['', ...ITEMS.keys()]);

const resolveLink = (link) => {
  if (!link.ref) return link;
  if (link.ref === 'account-page') return ACCOUNT.page;
  const item = ITEMS.get(link.ref);
  if (!item) throw new Error(`site/nav.json: the footer names "${link.ref}", which is not a menu item`);
  return { label: item.label, href: item.href, status: item.status };
};
/** The footer's site map: [{ title, links: [{ label, href, status? }] }], every { ref } resolved to the menu item it names. */
export const FOOTER = model.footer.map((g) => ({ title: g.title, links: g.links.map(resolveLink) }));

/** Which menu item is current on a page being adopted. After adoption the page's own marker is the truth. */
const ADOPT_PAGE = {
  'store/index.html': 'store', 'store/detail.html': 'store',
  'store/hotels.html': 'hotels', 'store/hotel.html': 'hotels',
  'store/flights.html': 'flights', 'store/flight-detail.html': 'flights',
  'store/activities.html': 'activities', 'store/food.html': 'food', 'store/places.html': 'places', 'store/journey-building.html': 'journey',
  'store/explore.html': 'explore', 'store/community.html': 'share', 'store/member-account.html': 'account',
};

/** A page's own footer part when it is adopted: what the old footer held that is not the shared footer's job. Nothing here is a claim the page did not already make. */
const ADOPT_EXTRA = {
  'store/index.html': '<p class="tg-foot-note">Provider links open external sites. Prices and availability are confirmed by the booking provider.</p>',
  'store/hotel.html': '<p class="tg-foot-note"><a href="/store/hotels" id="hd-back-foot">Back to hotels</a></p>',
};

const HEADER_RE = /<!-- site:header page="([a-z-]*)" -->[\s\S]*?<!-- \/site:header -->/;
const FOOTER_RE = /<!-- site:footer -->[\s\S]*?<!-- \/site:footer -->/;
const EXTRA_RE = /<!-- site:footer-extra -->([\s\S]*?)<!-- \/site:footer-extra -->/;

const partial = (name) => readFileSync(join(ROOT, 'site', 'chrome', name), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const chip = (item) => (item.status ? `<span class="tg-chip">${STATUS_WORD[item.status]}</span>` : '');

/** The header for a page: the modules with the current one marked and, inside the Travel Store, its sections as a second bar. */
export function renderHeader(page) {
  if (!PAGE_KEYS.has(page)) throw new Error(`"${page}" is not a menu item in site/nav.json`);
  const here = ITEMS.get(page);
  const owner = here?.module ?? null;
  const mark = (key, isModule) => (key === page ? ' aria-current="page"' : isModule && owner?.key === key ? ' aria-current="true"' : '');
  const nav = MODULES.map((m) => `      <a href="${m.href}"${mark(m.key, true)} data-nav-id="${m.key}">${m.label}${chip(m)}</a>`).join('\n');
  const account = `<a class="tg-account" href="${ACCOUNT.href}"${page === ACCOUNT.key ? ' aria-current="page"' : ''} data-nav-id="signin">${ACCOUNT.label}</a>`;
  const sub = owner?.sections
    ? [
        '  <div class="tg-sub">',
        '    <div class="tg-wrap">',
        `      <nav class="tg-subnav" aria-label="${owner.label} sections">`,
        ...owner.sections.map((s) => `        <a href="${s.href}"${s.key === page ? ' aria-current="page"' : ''} data-nav-id="${s.key}">${s.short ?? s.label}</a>`),
        '      </nav>',
        '    </div>',
        '  </div>',
      ].join('\n') + '\n'
    : '';
  const html = partial('header.html').replace('{{NAV}}', () => nav).replace('{{ACCOUNT}}', () => account).replace('{{SUBNAV}}\n', () => sub);
  return `<!-- site:header page="${page}" -->\n${html}\n<!-- /site:header -->`;
}

/** The footer: the site map of every module and page, then the page's own part. */
export function renderFooter(extra) {
  const groups = FOOTER.map((g) => [
    '      <div class="tg-sm-group">',
    `        <h2 class="tg-sm-h">${g.title}</h2>`,
    '        <ul>',
    ...g.links.map((l) => `          <li><a href="${l.href}">${l.label}${chip(l)}</a></li>`),
    '        </ul>',
    '      </div>',
  ].join('\n')).join('\n');
  return `<!-- site:footer -->\n${partial('footer.html').replace('{{SITEMAP}}', () => groups).replace('{{EXTRA}}', () => extra)}\n<!-- /site:footer -->`;
}

/** Puts the shared header and footer into a page and returns the page. Idempotent: stamping a stamped page changes nothing. `rel` is the page's path under public/, with slashes. */
export function stampPage(html, rel) {
  const crlf = html.includes('\r\n');
  let out = html.replace(/\r\n/g, '\n');

  // The header: a marked one is re-stamped with its own page key; an old one is adopted; a page with none gets one straight after <body>.
  const key = HEADER_RE.exec(out)?.[1] ?? ADOPT_PAGE[rel] ?? '';
  const header = renderHeader(key);
  if (HEADER_RE.test(out)) out = out.replace(HEADER_RE, () => header);
  else if (/<header\b[\s\S]*?<\/header>/.test(out)) out = out.replace(/<header\b[\s\S]*?<\/header>/, () => header);
  else out = out.replace(/<body([^>]*)>/, (m) => `${m}\n${header}`);
  // The old skip link of a page that had its own: the header carries one now.
  out = out.replace(/\n?<a class="skip" href="#main">Skip to main content<\/a>\n?/, '\n');

  // The footer, keeping the page's own part.
  const extra = EXTRA_RE.exec(out)?.[1] ?? ADOPT_EXTRA[rel] ?? '';
  const footer = renderFooter(extra);
  if (FOOTER_RE.test(out)) out = out.replace(FOOTER_RE, () => footer);
  else if (/<footer\b[\s\S]*?<\/footer>/.test(out)) out = out.replace(/<footer\b[\s\S]*?<\/footer>/, () => footer);
  else out = out.replace(/<\/body>/, () => `${footer}\n</body>`);

  // The stylesheet both are drawn with.
  if (!/<link rel="stylesheet" href="\/site\.css">/.test(out)) out = out.replace(/<\/head>/, () => '<link rel="stylesheet" href="/site.css">\n</head>');
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

/** Every page of the site: the .html files under public/, leaving out vendored code and artwork. */
export function listPages(dir = PUBLIC) {
  const pages = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { if (!['vendor', 'assets', 'fonts'].includes(name)) walk(p); } else if (name.endsWith('.html')) pages.push(p);
    }
  };
  walk(dir);
  return pages.sort();
}

const rel = (file, dir = PUBLIC) => relative(dir, file).split(sep).join('/');

// ------------------------------------------------------------------------------------------------------------------------------------------ links

/** Whether a path on this site is served: a file, a page by its clean URL, a folder's index, or a route of the Worker. */
export function served(pathname, dir = PUBLIC) {
  const path = decodeURIComponent(pathname);
  if (path.startsWith('/api/')) return true;   // the Store Worker's routes: not files, and not this script's to prove
  if (path === '/' ) return existsSync(join(dir, 'index.html'));
  const file = join(dir, path);
  if (path.endsWith('/')) return existsSync(join(file, 'index.html'));
  if (existsSync(file) && statSync(file).isFile()) return true;
  if (existsSync(file + '.html')) return true;
  return existsSync(join(file, 'index.html'));
}

const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
/** Ids a page's own script puts on the page after it loads, so a link to them is real although the HTML does not contain them. */
const SCRIPT_IDS = { '/store/journey-building': ['profile'] };
const routeOf = (relPath) => '/' + relPath.replace(/index\.html$/, '').replace(/\.html$/, '');

/** Every link in every page: where it goes, and whether that place exists. Links built by script are not seen here. */
export function checkLinks(dir = PUBLIC) {
  const problems = [];
  const warnings = [];
  const externals = new Map();
  const pages = listPages(dir);
  const pageIds = new Map(pages.map((p) => [routeOf(rel(p, dir)), idsOf(readFileSync(p, 'utf8'))]));
  for (const file of pages) {
    const r = rel(file, dir);
    const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const here = new URL(routeOf(r), SITE + '/');
    // Every reference, with the kind of element that holds it: a canonical address, a social card or a sitemap must name the site in full, a link people follow should not.
    const refs = [];
    for (const m of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
      const tag = m[1].toLowerCase();
      const attrs = Object.fromEntries([...m[2].matchAll(/\s([\w:-]+)="([^"]*)"/g)].map((a) => [a[1].toLowerCase(), a[2]]));
      for (const name of ['href', 'src', 'action', 'data-target', 'poster']) if (attrs[name] !== undefined) refs.push({ v: attrs[name], navigates: tag === 'a' || tag === 'form' || name === 'data-target' });
      if (attrs.srcset) refs.push(...attrs.srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).map((v) => ({ v, navigates: false })));
      if (tag === 'meta' && /^https:\/\/tourguid\.net\//.test(attrs.content ?? '')) refs.push({ v: attrs.content, navigates: false });
    }
    for (const { v, navigates } of refs) {
      if (!v || /^(mailto:|tel:|javascript:|data:)/.test(v) || v.includes('${')) continue;
      if (v === '#') continue;
      let url;
      try { url = new URL(v, here); } catch { problems.push(`${r}: not a link: ${v}`); continue; }
      if (url.origin !== SITE) { externals.set(url.origin + url.pathname, (externals.get(url.origin + url.pathname) ?? new Set()).add(r)); continue; }
      if (navigates && /^https:\/\/tourguid\.net/.test(v)) warnings.push(`${r}: ${v} names this site; write it root-relative`);
      if (!served(url.pathname, dir)) { problems.push(`${r}: ${v} goes nowhere (${url.pathname})`); continue; }
      if (url.hash && url.hash.length > 1) {
        const route = url.pathname.replace(/\.html$/, '').replace(/(.)\/$/, '$1');
        const ids = pageIds.get(url.pathname.replace(/\.html$/, '')) ?? pageIds.get(route) ?? pageIds.get(route + '/');
        const wanted = decodeURIComponent(url.hash.slice(1));
        if (ids && !ids.has(wanted) && !(SCRIPT_IDS[route] ?? []).includes(wanted)) problems.push(`${r}: ${v} points at an id that is not on the page`);
      }
    }
  }
  return { problems, warnings, externals: [...externals.keys()].sort() };
}

// ------------------------------------------------------------------------------------------------------------------------------------------- CLI

function main() {
  const check = process.argv.includes('--check');
  let changed = 0;
  let unknown = 0;
  for (const file of listPages()) {
    const before = readFileSync(file, 'utf8');
    let after;
    try { after = stampPage(before, rel(file)); } catch (err) { unknown += 1; console.log(`KEY   ${rel(file)}: ${err.message}`); continue; }
    if (after === before) continue;
    changed += 1;
    if (check) console.log(`differs: ${rel(file)}`);
    else writeFileSync(file, after);
  }
  const links = checkLinks();
  for (const p of links.problems) console.log(`LINK  ${p}`);
  for (const w of links.warnings) console.log(`warn  ${w}`);
  console.log(`${check ? 'would change' : 'changed'} ${changed} page(s); ${unknown} unknown menu key(s); ${links.problems.length} link problem(s), ${links.warnings.length} warning(s); ${links.externals.length} other site(s) linked`);
  if (check && (changed || unknown || links.problems.length)) process.exit(1);
  if (unknown) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
