// The pre-launch gate (src/gate.js): everything on tourguid.net except the home page asks for a password.
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COOKIE_NAME, LOGIN_PATH, LOGOUT_PATH, MAX_AGE, MIN_PASSWORD_LENGTH, PUBLIC_ROUTES,
  cookieValueIsGood, gate, makeCookieValue, needsGate, safeNext,
} from '../src/gate.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const siteCsp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(fs.readFileSync(path.join(publicDir, '_headers'), 'utf8'))[1].trim();

// A password made up for these tests. The real one is a secret that is never written in this repo.
const PASSWORD = 'test-only lantern-copper-orbit-4821';
const OTHER_PASSWORD = 'another test-only passphrase 9034';
const env = { GATE_PASSWORD: PASSWORD };
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const quick = { now: () => NOW, delayMs: 0 };
const BROWSER = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const at = (p, init = {}) => new Request(`https://tourguid.net${p}`, init);

function loginPost({ password = PASSWORD, next = '/store/hotels?destination=Paris', headers = {}, fields } = {}) {
  const body = new URLSearchParams(fields || { password, next }).toString();
  return at(LOGIN_PATH, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(body)), ...headers }, body });
}
const cookieOf = (response) => /^(__Host-tg_gate=[^;]+)/.exec(response.headers.get('set-cookie'))[1];
const withCookie = (p, cookie, init = {}) => at(p, { ...init, headers: { ...(init.headers || {}), cookie } });

// --- the map: what is open and what is not -------------------------------------------------------------------------------------------------------------------------------------------------------

/** Every file in public/, as the address it is asked for. */
function publicFiles() {
  const out = [];
  const walk = (dir) => { for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name); if (fs.statSync(p).isDirectory()) walk(p); else out.push('/' + path.relative(publicDir, p).split(path.sep).join('/')); } };
  walk(publicDir);
  return out;
}

// Written out here on purpose, apart from src/gate.js, so widening the open list there fails this test until it is widened here too, by someone who meant to.
const OPEN_FILES = new Set([
  '/index.html', '/under-construction.html',
  '/landing.css', '/landing.js', '/config.js', '/analytics.js', '/site.css', '/favicon.svg', '/tourguid-mark-on-dark.svg', '/robots.txt', '/sitemap.xml',
  '/store/date-range.js', '/store/place-autocomplete.js', '/store/place-autocomplete.css',
]);
const isOpenFile = (file) => OPEN_FILES.has(file) || (file.startsWith('/assets/') && /\.(?:png|jpe?g|svg|webp)$/.test(file)) || (file.startsWith('/fonts/') && file.endsWith('.woff2'));
/** The spellings a file answers to: the file itself, and for a page its clean address. */
const spellings = (file) => (file === '/index.html' ? ['/', '/index.html'] : file.endsWith('.html') ? [file, file.slice(0, -5)] : [file]);

test('every file in public/ is either on the short open list or behind the password, in every spelling it answers to', () => {
  const files = publicFiles();
  assert.ok(files.length > 100, `found ${files.length} files`);
  const open = [];
  for (const file of files) {
    for (const address of spellings(file)) {
      assert.equal(needsGate(address), !isOpenFile(file), `${address} (${file}): ${isOpenFile(file) ? 'should be open' : 'should ask for the password'}`);
    }
    if (isOpenFile(file)) open.push(file);
  }
  for (const file of OPEN_FILES) assert.ok(files.includes(file), `${file} is on the open list but is not a file`);
  assert.deepEqual(open.filter((f) => f.endsWith('.html')), ['/index.html', '/under-construction.html'], 'two pages are open: the home page and the page its sign-in buttons lead to');
  for (const f of ['/store/index.html', '/store/hotels.html', '/store/flights.html', '/store/member-account.html', '/store/journey-building.html', '/404.html']) assert.ok(files.includes(f) && !isOpenFile(f), f);
  // Nothing from /assets/ that is not a picture, nothing from /store/ but the three files the home page's search box is built from.
  for (const f of ['/assets/asset-register.csv', '/assets/photos/CREDITS.tsv', '/store/auth.js', '/store/config.js', '/store/vendor/supabase.min.js', '/store/inter-var.woff2', '/store/tourguid-logo.png', '/_headers']) {
    assert.equal(needsGate(f), true, f);
  }
});

test('the open API routes are exactly the two the home page\'s search box asks for; the rest of /api asks for the password', () => {
  assert.deepEqual([...PUBLIC_ROUTES].sort(), ['/api/store/airports', '/api/store/suggest']);
  for (const p of ['/api/store/health', '/api/store/go', '/api/store/hotels', '/api/store/flights', '/api/store/activities', '/api/store/places', '/api/store/feed', '/api/store/detail', '/api/store/providers', '/api/store/destinations', '/api/store/hero-photo', '/api/store/tiqets', '/api/anything', '/api']) {
    assert.equal(needsGate(p), true, p);
  }
});

test('an address that tries to be clever is not open: other case, doubled or encoded slashes and dots, backslashes, a folder walked out of, a page dressed as an open file', () => {
  const sneaky = [
    '/Store/hotels', '/STORE/', '/LANDING.CSS', '/Under-Construction', '//store/hotels', '/store//hotels', '/./store/hotels', '/landing.css/../store/hotels',
    '/landing.css/..%2fstore/hotels', '/assets/..%2fstore%2fhotels.html', '/assets/%2e%2e/store/hotels', '/assets/photos/..%2f..%2fstore/hotels.html', '/assets\\..\\store\\hotels',
    '/store/%2e%2e/store/hotels', '/fonts/%2e%2e/store/hotels', '/fonts/..%5cstore', '/%00', '/store/hotels%00.css', '/index.html/', '/under-construction.html/x', '/assets/', '/fonts/', '/assets/photos/',
    '/robots.txt.html/x', '/api/store/suggest/x', '/api/store/suggest%2fhealth', '/api//store/health', '/_gate/x', '/_gate/out/x', '/_gates',
    // Each of these would be open by the folder rule alone (right folder, right kind of file); only the guards against dots, encoded slashes and doubled slashes close them.
    '/assets/../store/tourguid-logo.png', '/assets/%2e%2e/store/tourguid-logo.png', '/assets/%2E%2E/store/tourguid-logo.png', '/assets/..%2fstore%2ftourguid-logo.png', '/assets/photos/%2e%2e/%2e%2e/store/tourguid-logo.png',
    '/fonts/../store/inter-var.woff2', '/fonts/%2e%2e/store/inter-var.woff2', '/fonts/..%2fstore%2finter-var.woff2', '/fonts/%5c..%5cstore%5cinter-var.woff2', '/assets/photos\\..\\..\\store\\tourguid-logo.png',
    '/assets//photos/hero-beach-1600.jpg', '/fonts//inter-var.woff2', '/assets/photos//hero-beach-1600.jpg', '/assets/photos/hero-beach-1600.jpg%00.html', '/assets/photos/hero-beach-1600.jpg%2f..%2f..%2fstore',
  ];
  for (const raw of sneaky) {
    // As the Worker sees it: a Request normalises what a browser would, so test both the raw string and the pathname the URL parser leaves.
    assert.equal(needsGate(raw), true, `raw ${raw}`);
    assert.equal(needsGate(new URL(raw, 'https://tourguid.net').pathname), true, `parsed ${raw}`);
  }
  assert.equal(needsGate(LOGIN_PATH), false);
  assert.equal(needsGate(LOGOUT_PATH), false);
});

test('everything the open pages load is open: scripts, styles, fonts, pictures, icons, the social card, the search routes', () => {
  const pages = ['index.html', 'under-construction.html', '404.html'];
  const problems = [];
  const seen = new Set();
  const consider = (ref, from, how) => {
    if (!ref || ref.startsWith('#') || /^(?:data|mailto|tel|javascript):/.test(ref)) return;
    const u = new URL(ref.trim(), `https://tourguid.net${from}`);
    if (u.origin !== 'https://tourguid.net') return;
    seen.add(u.pathname);
    if (needsGate(u.pathname)) problems.push(`${from} loads ${u.pathname} (${how}), which asks for the password`);
  };
  const css = (text, from) => { for (const m of text.matchAll(/url\(\s*['"]?([^'")\s]+)/g)) consider(m[1], from, 'css url()'); for (const m of text.matchAll(/@import\s+(?:url\()?['"]([^'"]+)/g)) consider(m[1], from, 'css @import'); };
  const js = (text, from) => {
    for (const m of text.matchAll(/(?:\.\/|\/)assets\/[^'"`)\s]+/g)) consider(m[0], from, 'script');
    for (const m of text.matchAll(/\/api\/store\/([a-z-]+)/g)) consider(`/api/store/${m[1]}`, from, 'script fetch');
  };
  const queue = [];
  for (const name of pages) {
    const from = name === 'index.html' ? '/' : `/${name.replace(/\.html$/, '')}`;
    const html = fs.readFileSync(path.join(publicDir, name), 'utf8');
    for (const m of html.matchAll(/<(?:script|img|source)\b[^>]*?\ssrc="([^"]+)"/g)) { consider(m[1], from, 'src'); queue.push(m[1]); }
    for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of m[1].split(',')) consider(part.trim().split(/\s+/)[0], from, 'srcset');
    for (const tag of html.matchAll(/<link\b[^>]*>/g)) {
      const rel = /\brel="([^"]+)"/.exec(tag[0]); const href = /\bhref="([^"]+)"/.exec(tag[0]);
      if (rel && href && /(?:^|\s)(?:stylesheet|icon|apple-touch-icon|preload|modulepreload|manifest|mask-icon|prefetch)(?:\s|$)/.test(rel[1])) { consider(href[1], from, `link ${rel[1]}`); queue.push(href[1]); }
    }
    for (const m of html.matchAll(/<meta\b[^>]*(?:og:image"|twitter:image")[^>]*\bcontent="([^"]+)"/g)) consider(m[1], from, 'social card');
    for (const m of html.matchAll(/"(?:logo|image)"\s*:\s*"([^"]+)"/g)) consider(m[1], from, 'structured data');
    css(html, from);
  }
  // One level down: the styles and scripts those pages pull in.
  for (const ref of new Set(queue)) {
    const file = new URL(ref, 'https://tourguid.net/').pathname;
    const disk = path.join(publicDir, file);
    if (!fs.existsSync(disk) || fs.statSync(disk).isDirectory()) continue;
    if (file.endsWith('.css')) css(fs.readFileSync(disk, 'utf8'), file);
    if (file.endsWith('.js')) js(fs.readFileSync(disk, 'utf8'), file);
  }
  assert.deepEqual(problems, []);
  assert.ok(seen.size >= 20, `looked at ${seen.size} references`);
  for (const must of ['/landing.css', '/site.css', '/config.js', '/landing.js', '/analytics.js', '/store/place-autocomplete.js', '/store/date-range.js', '/fonts/inter-var.woff2', '/favicon.svg', '/tourguid-mark-on-dark.svg', '/assets/photos/hero-beach-1600.jpg', '/assets/og-1200x630.png', '/api/store/suggest']) {
    assert.ok(seen.has(must), `${must} should have been found among what the open pages load (the scan is not looking in the right places)`);
  }
  // The search box builds /api/store/${airports ? 'airports' : 'suggest'}; the scan above sees only the literal part, so name the two it can ask for.
  const autocomplete = fs.readFileSync(path.join(publicDir, 'store', 'place-autocomplete.js'), 'utf8');
  assert.match(autocomplete, /\/api\/store\/\$\{airports\?'airports':'suggest'\}/);
  assert.match(autocomplete, /\/api\/store\/suggest\?/);
});

test('the open pages\' own links into the Store are the one thing that leads behind the password, and they go to the password page, not to nothing', () => {
  const home = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const links = [...home.matchAll(/<a\b[^>]*\shref="(\/store[^"]*)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 10, `${links.length} links from the home page into the Store`);
  for (const link of links) assert.equal(needsGate(new URL(link, 'https://tourguid.net').pathname), true, link);
  assert.match(home, /action="\/store\/hotels\.html"/);
});

test('robots.txt still lets crawlers in (they must see the 401 and the noindex to drop the old listings), and the sitemap names the home page only', () => {
  const robots = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
  assert.doesNotMatch(robots, /^\s*Disallow:\s*\S/m);
  assert.match(robots, /^Allow: \/\s*$/m);
  const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://tourguid.net/']);
});

// --- the refusal ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a browser that asks for a closed page gets the password page: 401, never indexed, never cached, never framed, and the form comes back to where it was going', async () => {
  const res = await gate(at('/store/hotels?destination=Paris&adults=2', { headers: BROWSER }), env, quick);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'same-origin', 'the page with the form must not say no-referrer: that makes browsers post "Origin: null"');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /script-src/, 'the page runs no script');
  assert.equal(res.headers.get('set-cookie'), null);
  const html = await res.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.match(html, /<form method="post" action="\/_gate">/);
  assert.match(html, /<input type="hidden" name="next" value="\/store\/hotels\?destination=Paris&amp;adults=2">/);
  assert.match(html, /<label for="pw">Password<\/label>/);
  assert.match(html, /<input id="pw" name="password" type="password" autocomplete="current-password" required>/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, new RegExp(PASSWORD));
  assert.doesNotMatch(html, /role="alert"/, 'a first visit is not an error');
});

test('a script, a style sheet or an image asked for without the password gets a short refusal, and the API gets JSON: 401, noindex, private', async () => {
  const css = await gate(at('/store/hotel-stays.css'), env, quick);
  assert.equal(css.status, 401);
  assert.match(css.headers.get('content-type'), /^text\/plain/);
  assert.equal(css.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(css.headers.get('cache-control'), 'private, no-store');
  assert.equal(await css.text(), 'This part of TourGuid is not open yet.');
  const api = await gate(at('/api/store/hotels?destination=Paris', { headers: { accept: 'application/json' } }), env, quick);
  assert.equal(api.status, 401);
  assert.equal(api.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await api.json(), { error: 'This part of TourGuid is not open yet.' });
  const apiFromBrowser = await gate(at('/api/store/health', { headers: BROWSER }), env, quick);
  assert.equal(apiFromBrowser.status, 401, 'an API address typed into a browser still gets the password page, which is a 401');
  const post = await gate(at('/store/hotels', { method: 'POST', headers: BROWSER }), env, quick);
  assert.equal(post.status, 401);
  assert.match(post.headers.get('content-type'), /^text\/plain/);
});

test('a HEAD gets the same status and headers as the GET, with no body', async () => {
  const get = await gate(at('/store/', { headers: BROWSER }), env, quick);
  const head = await gate(at('/store/', { method: 'HEAD', headers: BROWSER }), env, quick);
  assert.equal(head.status, 401);
  assert.equal(await head.text(), '');
  for (const h of ['content-type', 'x-robots-tag', 'cache-control', 'content-security-policy']) assert.equal(head.headers.get(h), get.headers.get(h), h);
  const headApi = await gate(at('/api/store/health', { method: 'HEAD' }), env, quick);
  assert.equal(headApi.status, 401);
  assert.equal(await headApi.text(), '');
});

test('the open addresses are not touched: the gate lets them through to the site', async () => {
  for (const p of ['/', '/index.html', '/under-construction', '/under-construction.html', '/landing.css', '/landing.js', '/config.js', '/analytics.js', '/site.css', '/favicon.svg',
    '/tourguid-mark-on-dark.svg', '/robots.txt', '/sitemap.xml', '/store/date-range.js', '/store/place-autocomplete.js', '/store/place-autocomplete.css',
    '/assets/photos/hero-beach-1600.jpg', '/assets/og-1200x630.png', '/fonts/inter-var.woff2', '/api/store/suggest?q=par', '/api/store/airports?q=par', '/?booking=success']) {
    assert.equal(await gate(at(p, { headers: BROWSER }), env, quick), null, p);
  }
  // Open means open for everybody, with or without a gate that is set up.
  assert.equal(await gate(at('/', { headers: BROWSER }), {}, quick), null);
  assert.equal(await gate(at('/api/store/suggest?q=par'), { GATE_PASSWORD: 'short' }, quick), null);
});

// --- fail closed ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('with no password set up, or one that is too short to be a real one, every closed address is closed (503) and nothing can open it', async () => {
  assert.ok(MIN_PASSWORD_LENGTH >= 16);
  for (const bad of [{}, { GATE_PASSWORD: '' }, { GATE_PASSWORD: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }, { GATE_PASSWORD: undefined }, { GATE_PASSWORD: 12345678901234567890 }, { GATE_PASSWORD: null }]) {
    const page = await gate(at('/store/hotels', { headers: BROWSER }), bad, quick);
    assert.equal(page.status, 503, JSON.stringify(bad));
    assert.equal(page.headers.get('retry-after'), '3600');
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    const html = await page.text();
    assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ''), /<form|<input|password/i, 'a closed gate offers no form: there is nothing to type');
    assert.match(html, /Not open yet/);
    const api = await gate(at('/api/store/go?to=x'), bad, quick);
    assert.equal(api.status, 503);
    // A cookie cannot open it, however it was made. (Made here with the password it would have had.)
    const cookie = `${COOKIE_NAME}=${await makeCookieValue(PASSWORD, NOW)}`;
    assert.equal((await gate(withCookie('/store/hotels', cookie, { headers: BROWSER }), bad, quick)).status, 503);
    // Posting the password to a gate that is not set up gives no cookie either.
    const posted = await gate(loginPost({ password: PASSWORD }), bad, quick);
    assert.equal(posted.status, 503);
    assert.equal(posted.headers.get('set-cookie'), null);
    assert.equal((await gate(at(LOGIN_PATH, { headers: BROWSER }), bad, quick)).status, 503);
  }
});

// --- signing in ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the right password sets a cookie that is secure, host-only and unreadable by scripts, and sends the visitor to where they were going', async () => {
  const res = await gate(loginPost(), env, quick);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/store/hotels?destination=Paris');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /^__Host-tg_gate=v1\.\d+\.[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.doesNotMatch(setCookie, /Domain/i, 'a __Host- cookie has no Domain: it belongs to this host and no other');
  assert.equal(MAX_AGE, 2592000);
  assert.ok(!setCookie.includes(PASSWORD));
  // And it opens the closed addresses, for any method, and nothing else is needed.
  const cookie = cookieOf(res);
  for (const p of ['/store/hotels', '/store/', '/api/store/health', '/store/hotel-stays.css']) assert.equal(await gate(withCookie(p, cookie, { headers: BROWSER }), env, quick), null, p);
  assert.equal(await gate(withCookie('/api/store/go', cookie, { method: 'POST' }), env, quick), null);
});

test('a wrong password gets the page again with a reason, no cookie, and waits first', async () => {
  const started = Date.now();
  const res = await gate(loginPost({ password: PASSWORD + 'x', next: '/store/flights?from=LHR&to=CDG' }), env, { now: () => NOW, delayMs: 60 });
  assert.ok(Date.now() - started >= 50, 'a wrong password waits');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  const html = await res.text();
  assert.match(html, /role="alert">That password isn&rsquo;t right\. Try again\./);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="why"/);
  assert.match(html, /<input type="hidden" name="next" value="\/store\/flights\?from=LHR&amp;to=CDG">/, 'the visitor is not sent back to the start');
  assert.doesNotMatch(html, new RegExp(PASSWORD));
  for (const wrong of ['', ' ', PASSWORD.toUpperCase(), PASSWORD.slice(0, -1), PASSWORD + ' ', ' ' + PASSWORD, 'x'.repeat(4000), '\u0000', OTHER_PASSWORD]) {
    const r = await gate(loginPost({ password: wrong }), env, quick);
    assert.equal(r.status, 401, JSON.stringify(wrong.slice(0, 20)));
    assert.equal(r.headers.get('set-cookie'), null);
  }
  const missing = await gate(loginPost({ fields: { next: '/store/' } }), env, quick);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('set-cookie'), null);
  const json = await gate(at(LOGIN_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '30' }, body: JSON.stringify({ password: PASSWORD }) }), env, quick);
  assert.equal(json.status, 401, 'the password is only accepted from the form');
  assert.equal(json.headers.get('set-cookie'), null);
});

test('the login page itself: shown for GET and HEAD with the address it will go on to, cleaned; other methods are refused', async () => {
  const res = await gate(at(`${LOGIN_PATH}?next=${encodeURIComponent('/store/places?destination=Rome')}`, { headers: BROWSER }), env, quick);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.match(await res.text(), /name="next" value="\/store\/places\?destination=Rome"/);
  for (const hostile of ['//evil.example', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)', '/_gate']) {
    const r = await gate(at(`${LOGIN_PATH}?next=${encodeURIComponent(hostile)}`), env, quick);
    assert.match(await r.text(), /name="next" value="\/store\/"/, hostile);
  }
  const head = await gate(at(LOGIN_PATH, { method: 'HEAD' }), env, quick);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const put = await gate(at(LOGIN_PATH, { method: 'PUT' }), env, quick);
  assert.equal(put.status, 405);
  assert.equal(put.headers.get('allow'), 'GET, HEAD, POST');
  assert.equal((await gate(at(LOGIN_PATH, { method: 'DELETE' }), env, quick)).status, 405);
});

test('where the visitor goes after the password is an address on this site and nothing else', () => {
  const ok = ['/store/', '/store/hotels?destination=Paris&adults=2', '/store/flights#top', '/a', '/store/hotel?id=%2Fx', '/x'.repeat(100), '/store/%2f/evil.example'];
  for (const n of ok) assert.equal(safeNext(n), n, n);
  const fallback = '/store/';
  const bad = [
    '', undefined, null, 42, {}, [], 'store/hotels', 'https://evil.example/', 'http://evil.example', '//evil.example', '//evil.example/store', '/\\evil.example', '/\\/evil.example', '\\\\evil.example',
    'javascript:alert(1)', 'data:text/html,x', '/ evil', '/store/\nhotels', '/store/\rhotels', '/store/\thotels', '/store\u0000', '/store\\hotels', ' /store/', '/store/ ', '/x'.repeat(260),
    LOGIN_PATH, `${LOGIN_PATH}/`, `${LOGIN_PATH}?next=/`, `${LOGIN_PATH}/out`, `${LOGOUT_PATH}`,
  ];
  for (const n of bad) assert.equal(safeNext(n), fallback, JSON.stringify(n));
  assert.equal(safeNext('/_gates'), '/_gates', 'only the gate\'s own addresses are refused');
});

test('what is put into the page is escaped: an address that carries markup cannot break out of the form', async () => {
  const res = await gate(at('/store/x"><script>alert(1)</script>', { headers: BROWSER }), env, quick);
  const html = await res.text();
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /alert\(1\)<\//);
  assert.match(html, /name="next" value="[^"]*"/);
  const quote = await gate(at('/store/a%22b?x=%27y%27&z=<i>', { headers: BROWSER }), env, quick);
  const quoted = await quote.text();
  assert.doesNotMatch(quoted, /value="[^"]*"[^>]*"b/);
  assert.doesNotMatch(quoted, /<i>/);
});

test('the login only takes a post from this site, and a post that is too big or has no size is turned away before anything is read', async () => {
  const cases = [
    ['another site (Sec-Fetch-Site: cross-site)', { 'sec-fetch-site': 'cross-site' }, 403],
    ['a sibling host (Sec-Fetch-Site: same-site)', { 'sec-fetch-site': 'same-site', origin: 'https://app.tourguid.net' }, 403],
    ['no Sec-Fetch-Site and a foreign Origin', { origin: 'https://evil.example' }, 403],
    ['no Sec-Fetch-Site and the app host as Origin', { origin: 'https://app.tourguid.net' }, 403],
    ['a browser on this site (Sec-Fetch-Site: same-origin)', { 'sec-fetch-site': 'same-origin', origin: 'https://tourguid.net' }, 303],
    ['this site, but the browser followed no-referrer and sent Origin: null', { 'sec-fetch-site': 'same-origin', origin: 'null' }, 303],
    ['no Sec-Fetch-Site and this site as Origin', { origin: 'https://tourguid.net' }, 303],
    ['no browser headers at all (curl)', {}, 303],
  ];
  for (const [label, headers, status] of cases) {
    const res = await gate(loginPost({ headers }), env, quick);
    assert.equal(res.status, status, label);
    assert.equal(!!res.headers.get('set-cookie'), status === 303, `${label}: cookie only when allowed`);
  }
  const big = await gate(at(LOGIN_PATH, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': '4097' }, body: 'password=x' }), env, quick);
  assert.equal(big.status, 413);
  const unsized = await gate(at(LOGIN_PATH, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=x' }), env, quick);
  assert.equal(unsized.status, 413, 'a post with no stated size is not read');
  const edge = await gate(loginPost({ password: PASSWORD, next: '/' + 'a'.repeat(100) }), env, quick);
  assert.equal(edge.status, 303);
});

test('too many tries from one address are stopped before the password is looked at, and a limiter that breaks does not lock everyone out', async () => {
  const keys = [];
  const refusing = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  const stopped = await gate(loginPost({ headers: { 'cf-connecting-ip': '203.0.113.9' } }), { ...env, GATE_LIMITER: refusing }, quick);
  assert.equal(stopped.status, 429);
  assert.equal(stopped.headers.get('retry-after'), '60');
  assert.equal(stopped.headers.get('set-cookie'), null, 'even the right password gets nothing while the limit is hit');
  assert.match(await stopped.text(), /Too many tries/);
  assert.deepEqual(keys, ['203.0.113.9']);
  const allowing = { limit: async () => ({ success: true }) };
  assert.equal((await gate(loginPost(), { ...env, GATE_LIMITER: allowing }, quick)).status, 303);
  const broken = { limit: async () => { throw new Error('limiter down'); } };
  assert.equal((await gate(loginPost(), { ...env, GATE_LIMITER: broken }, quick)).status, 303);
  assert.equal((await gate(loginPost({ password: 'wrong' }), { ...env, GATE_LIMITER: broken }, quick)).status, 401, 'a broken limiter still needs the password');
  const unknown = await gate(loginPost(), { ...env, GATE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: true }; } } }, quick);
  assert.equal(unknown.status, 303);
  assert.equal(keys.at(-1), 'unknown', 'with no address to count, tries are counted together rather than not at all');
});

test('signing out clears the cookie (post) and a plain visit to the address changes nothing (get)', async () => {
  const out = await gate(at(LOGOUT_PATH, { method: 'POST' }), env, quick);
  assert.equal(out.status, 303);
  assert.equal(out.headers.get('location'), '/');
  assert.equal(out.headers.get('set-cookie'), `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  const visit = await gate(at(LOGOUT_PATH), env, quick);
  assert.equal(visit.status, 303);
  assert.equal(visit.headers.get('set-cookie'), null, 'a link someone is tricked into following cannot sign them out');
});

// --- the cookie ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a cookie is good only if this password made it, it has not run out, and it has not been touched', async () => {
  const good = await makeCookieValue(PASSWORD, NOW);
  assert.equal(await cookieValueIsGood(good, PASSWORD, NOW), true);
  assert.equal(await cookieValueIsGood(good, PASSWORD, NOW + (MAX_AGE - 5) * 1000), true, 'still good just before it runs out');
  assert.equal(await cookieValueIsGood(good, PASSWORD, NOW + (MAX_AGE + 5) * 1000), false, 'run out');
  assert.equal(await cookieValueIsGood(good, PASSWORD, NOW + MAX_AGE * 1000), false, 'run out exactly now');
  assert.equal(await cookieValueIsGood(good, OTHER_PASSWORD, NOW), false, 'changing the password signs everybody out');
  const [v, exp, sig] = good.split('.');
  const flip = (s) => s.slice(0, -1) + (s.at(-1) === 'A' ? 'B' : 'A');
  const forged = [
    `${v}.${Number(exp) + 1000}.${sig}`, `${v}.${Number(exp) + 1}.${sig}`, `${v}.${exp}.${flip(sig)}`, `${v}.${exp}.${sig.slice(0, -1)}`, `${v}.${exp}.${sig}A`, `v2.${exp}.${sig}`,
    `${v}.${exp}`, `${exp}.${sig}`, `${v}..${sig}`, `${v}.${exp}.`, '', 'v1', 'v1.1.2', 'true', '1', 'admin', `${good};x`, ` ${good}`, `${good} `, `${v}.${exp}.${sig}.${sig}`, `${v}.-5.${sig}`, `${v}.1e9.${sig}`,
  ];
  for (const f of forged) assert.equal(await cookieValueIsGood(f, PASSWORD, NOW), false, f);
  assert.equal(await cookieValueIsGood(undefined, PASSWORD, NOW), false);
  assert.equal(await cookieValueIsGood(null, PASSWORD, NOW), false);
  // A cookie dated further ahead than the server ever issues, even one signed with the right password, is refused.
  const future = await makeCookieValue(PASSWORD, NOW + 5 * MAX_AGE * 1000);
  assert.equal(await cookieValueIsGood(future, PASSWORD, NOW), false);
});

test('at the door: a good cookie opens the closed addresses; a bad one, an old one, a one from another password or one under another name does not', async () => {
  const good = `${COOKIE_NAME}=${await makeCookieValue(PASSWORD, NOW)}`;
  assert.equal(await gate(withCookie('/store/hotels', good, { headers: BROWSER }), env, quick), null);
  assert.equal(await gate(withCookie('/store/hotels', `other=1; ${good}; more=2`, { headers: BROWSER }), env, quick), null, 'among other cookies');
  const refused = [
    ['no cookie', ''],
    ['another password', `${COOKIE_NAME}=${await makeCookieValue(OTHER_PASSWORD, NOW)}`],
    ['expired', `${COOKIE_NAME}=${await makeCookieValue(PASSWORD, NOW - (MAX_AGE + 10) * 1000)}`],
    ['under a name without the prefix', `tg_gate=${await makeCookieValue(PASSWORD, NOW)}`],
    ['under a different prefix', `__Secure-tg_gate=${await makeCookieValue(PASSWORD, NOW)}`],
    ['garbage', `${COOKIE_NAME}=nonsense`],
    ['empty', `${COOKIE_NAME}=`],
    ['the name only', COOKIE_NAME],
    ['the password itself', `${COOKIE_NAME}=${PASSWORD}`],
  ];
  for (const [label, cookie] of refused) {
    const res = await gate(withCookie('/store/hotels', cookie, { headers: BROWSER }), env, quick);
    assert.ok(res && res.status === 401, label);
  }
  // Rotating the password: the cookie made under the old one stops working the moment the secret changes, the new one starts.
  assert.equal((await gate(withCookie('/store/hotels', good, { headers: BROWSER }), { GATE_PASSWORD: OTHER_PASSWORD }, quick)).status, 401);
});

// --- the whole Worker -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** src/index.js as Cloudflare runs it, with stand-ins for what only Cloudflare has: the page rewriter, the cache and the static assets. */
async function worker() {
  globalThis.HTMLRewriter ??= class { on() { return this; } transform(response) { return response; } };
  globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };
  const { default: app } = await import('../src/index.js');
  const reached = [];
  const points = [];
  const bound = {
    ...env,
    STATS: { writeDataPoint: (p) => points.push(p) },
    ASSETS: {
      fetch: async (request) => {
        reached.push(new URL(request.url).pathname);
        return new Response('<!doctype html><title>a page</title>', { headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'content-security-policy': siteCsp, 'referrer-policy': 'no-referrer' } });
      },
    },
  };
  return { reached, points, ask: (request) => app.fetch(request, bound, { waitUntil() {} }) };
}

test('the whole Worker: a closed address is stopped at the door and never reaches the site, the home page is untouched, a visitor with the cookie gets the site marked private', async () => {
  const { reached, points, ask } = await worker();

  const closed = await ask(at('/store/hotels', { headers: BROWSER }));
  assert.equal(closed.status, 401);
  assert.deepEqual(reached, [], 'the static site was never asked');
  const api = await ask(at('/api/store/hotels?destination=Paris'));
  assert.equal(api.status, 401);
  assert.deepEqual(points, [], 'no count is kept for what the gate refused');

  const home = await ask(at('/', { headers: BROWSER }));
  assert.equal(home.status, 200);
  assert.deepEqual(reached, ['/']);
  assert.equal(home.headers.get('x-robots-tag'), null, 'the home page stays indexable');
  assert.equal(home.headers.get('cache-control'), null);
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors https:\/\/www\.figma\.com https:\/\/figma\.com/, 'and still framed by Figma, and nobody else');

  const search = await ask(at('/api/store/suggest', { headers: { accept: 'application/json' } }));
  assert.equal(search.status, 200, 'the home page\'s search suggestions reach the Store Worker');
  assert.equal(points.length, 1);

  const login = await ask(loginPost({ next: '/store/hotels' }));
  assert.equal(login.status, 303);
  const cookie = cookieOf(login);
  const inside = await ask(withCookie('/store/hotels', cookie, { headers: BROWSER }));
  assert.equal(inside.status, 200);
  assert.deepEqual(reached, ['/', '/store/hotels']);
  assert.equal(inside.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(inside.headers.get('cache-control'), 'private, no-store');
  assert.match(inside.headers.get('vary'), /Cookie/i);
  assert.equal(inside.headers.get('x-frame-options'), 'DENY', 'a page behind the password is never framed');
  assert.match(inside.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  const insideApi = await ask(withCookie('/api/store/health', cookie));
  assert.equal(insideApi.status, 200, 'with the cookie the request reaches the Store Worker');
  assert.equal((await insideApi.json()).storeSearch, 'not_configured', 'and this is the Store Worker\'s own answer, not the gate\'s');
  assert.equal(insideApi.headers.get('cache-control'), 'private, no-store');
  assert.equal(points.length, 2, 'the two API calls that reached the Store Worker were counted, the one the gate refused was not');
});

test('the Worker puts the gate in front of everything, and the gate\'s own answers never go through the analytics', () => {
  const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
  assert.match(index, /import \{ gated \} from '\.\/gate\.js'/);
  assert.match(index, /return gated\(request, env, \(\) => site\(request, env, ctx\)\)/);
  assert.match(index, /const response = figmaFrameResponse\(request, await worker\.fetch\(request, env, ctx\)\)/);
});

test('every page behind the password is also on the "never framed" list, so the one list of public pages is the home page alone', async () => {
  const { FIGMA_FRAMEABLE, NEVER_FRAMEABLE } = await import('../src/frame-policy.js');
  assert.deepEqual([...FIGMA_FRAMEABLE], ['/']);
  for (const file of publicFiles().filter((f) => f.endsWith('.html'))) {
    const page = file === '/index.html' ? '/' : file.endsWith('/index.html') ? file.slice(0, -'/index.html'.length) : file.slice(0, -5);
    if (needsGate(page)) assert.ok(NEVER_FRAMEABLE.has(page), `${page} is behind the password and must be listed as never framed`);
  }
});

test('the gate rate-limit counter has a number of its own: one namespace_id belongs to one Worker, and these belong to the others', () => {
  const TAKEN = { 1001: 'TourGuid-Intro SIGNUP_LIMIT', 1002: 'the retired z1 AUTH_LIMIT', 2001: 'TourGuid-App ACCOUNT_LIMIT', 2002: 'TourGuid-App ACCOUNT_SIGNIN_LIMIT' };
  const config = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const ids = [...config.matchAll(/"namespace_id":\s*"(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['3001'], 'this Worker has one counter, the gate');
  for (const id of ids) assert.equal(TAKEN[id], undefined, `${id} is already ${TAKEN[id]}`);
});
