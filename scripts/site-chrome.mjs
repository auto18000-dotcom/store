// One header and one footer for every page of tourguid.net, and a check that every link on the site goes somewhere.
//
//   node scripts/site-chrome.mjs           put the header and the footer (site/chrome/) into every page of public/, and rewrite what differs
//   node scripts/site-chrome.mjs --check   change nothing; exit 1 if any page's header or footer differs from site/chrome/, or if a link goes nowhere
//
// Why this exists: the site had 13 different headers and 15 different footers, no two alike, and the logo on every Store page led to the Store and not to the home page. The pages are
// static HTML served as they are (no build, no templates), so the shared parts are written INTO each page between markers, and this script is the only thing that edits between them:
//
//   <!-- site:header page="hotels" -->   ...the header...   <!-- /site:header -->        page = which item of the main menu is the current one ("" for none)
//   <!-- site:footer -->                 ...the footer...   <!-- /site:footer -->
//   inside the footer, <!-- site:footer-extra -->...<!-- /site:footer-extra --> is the page's OWN part (photo credits, a back link) and is kept as it is.
//
// A page with neither marker and an old <header>/<footer> is adopted: the old one is replaced. The main menu is NAV below; the other parts are the two files in site/chrome/.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC = join(ROOT, 'public');
const SITE = 'https://tourguid.net';

/** The main menu. The Store's own sections come after Travel Store, as they did in the Store's header; `key` is what a page's marker names to say "I am this one". */
export const NAV = [
  { key: 'store', label: 'Travel Store', href: '/store/' },
  { key: 'hotels', label: 'Hotels', href: '/store/hotels' },
  { key: 'flights', label: 'Flights', href: '/store/flights' },
  { key: 'activities', label: 'Activities', href: '/store/activities' },
  { key: 'food', label: 'Food', href: '/store/food' },
  { key: 'places', label: 'Places', href: '/store/places' },
];

/** Which menu item is current on a page being adopted. After adoption the page's own marker is the truth. */
const ADOPT_PAGE = { 'store/index.html': 'store', 'store/hotels.html': 'hotels', 'store/hotel.html': 'hotels', 'store/flights.html': 'flights', 'store/flight-detail.html': 'flights', 'store/activities.html': 'activities', 'store/food.html': 'food', 'store/places.html': 'places' };

/** A page's own footer part when it is adopted: what the old footer held that is not the shared footer's job. Nothing here is a claim the page did not already make. */
const ADOPT_EXTRA = {
  'store/index.html': '<p class="tg-foot-note">Provider links open external sites. Prices and availability are confirmed by the booking provider.</p>',
  'store/hotel.html': '<p class="tg-foot-note"><a href="/store/hotels" id="hd-back-foot">Back to hotels</a></p>',
};

const HEADER_RE = /<!-- site:header page="([a-z-]*)" -->[\s\S]*?<!-- \/site:header -->/;
const FOOTER_RE = /<!-- site:footer -->[\s\S]*?<!-- \/site:footer -->/;
const EXTRA_RE = /<!-- site:footer-extra -->([\s\S]*?)<!-- \/site:footer-extra -->/;

const partial = (name) => readFileSync(join(ROOT, 'site', 'chrome', name), 'utf8').replace(/\r\n/g, '\n').trimEnd();

export function renderHeader(page) {
  const nav = NAV.map((n) => `      <a href="${n.href}"${n.key === page ? ' aria-current="page"' : ''}>${n.label}</a>`).join('\n');
  return `<!-- site:header page="${page}" -->\n${partial('header.html').replace('{{NAV}}', () => nav)}\n<!-- /site:header -->`;
}

export function renderFooter(extra) {
  return `<!-- site:footer -->\n${partial('footer.html').replace('{{EXTRA}}', () => extra)}\n<!-- /site:footer -->`;
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
  for (const file of listPages()) {
    const before = readFileSync(file, 'utf8');
    const after = stampPage(before, rel(file));
    if (after === before) continue;
    changed += 1;
    if (check) console.log(`differs: ${rel(file)}`);
    else writeFileSync(file, after);
  }
  const links = checkLinks();
  for (const p of links.problems) console.log(`LINK  ${p}`);
  for (const w of links.warnings) console.log(`warn  ${w}`);
  console.log(`${check ? 'would change' : 'changed'} ${changed} page(s); ${links.problems.length} link problem(s), ${links.warnings.length} warning(s); ${links.externals.length} other site(s) linked`);
  if (check && (changed || links.problems.length)) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
