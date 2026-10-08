// The pre-launch gate: tourguid.net is not ready for strangers, so everything on it except the home page asks for a password.
//
// The owner, 2026-10-07: "Only tourguid.net index/home page should be accessible to the public." Real sign-in is the way this ends (Phase 1, item 8) and is being built separately; until it ships
// this is the lock, and it is meant to come off cleanly: take the one call out of src/index.js and delete this file, its test, and the "behind the gate" lines in src/frame-policy.js.
//
// THE RULE IS DEFAULT-DENY. A request is open only if its path is on the short public list below; anything else (a page added next month, a file nobody remembered, a guessed address) asks for the
// password. The public list is what the home page needs to be the home page, and test/gate.test.mjs checks, mechanically, that nothing the open pages load is closed and that nothing else is open.
//
//   * One shared password, in the GATE_PASSWORD secret. If it is missing or shorter than MIN_PASSWORD_LENGTH the gate FAILS CLOSED: every gated address answers 503 and nothing opens. It never
//     opens by default. Generate it (a passphrase of random words is fine); the cookie below is keyed by it, so a guessable password would be guessable from a stolen cookie too.
//   * A visitor who enters it gets a cookie named __Host-tg_gate: Secure, HttpOnly, SameSite=Lax, Path=/, and no Domain, which the __Host- prefix makes the browser enforce (it cannot be shared
//     with app.tourguid.net or any other host). It holds an expiry and an HMAC of that expiry made with the password, so it cannot be forged, and changing the password signs everybody out at once.
//   * Wrong passwords wait a moment, and are rate limited per address when the GATE_LIMITER binding exists. The gate is a lock for a pre-launch week, not a fortress.
//   * Everything gated is marked noindex and uncacheable, and the gate answers 401, so search engines drop what they already hold. robots.txt deliberately still says Allow: a crawler must be
//     able to reach the 401 and the noindex to learn the pages are gone (a Disallow would freeze the old listings in place).
//
// Not touched: app.tourguid.net is a different Worker. Its reserved paths (the two .well-known files, the reset and confirm pages, privacy, terms, delete-account, and the front page that Duffel
// returns travellers to) are not behind anything here and must never be put behind anything like this.
import { canonicalPath } from './frame-policy.js';

export const COOKIE_NAME = '__Host-tg_gate';
export const LOGIN_PATH = '/_gate';
export const LOGOUT_PATH = '/_gate/out';
export const MAX_AGE = 60 * 60 * 24 * 30;
export const MIN_PASSWORD_LENGTH = 16;
const MAX_FORM_BYTES = 4096;

/** The home page, and the page its Sign up and Sign in buttons lead to. */
export const PUBLIC_PAGES = new Set(['/', '/under-construction']);
/** What those pages load that is not an image or a font: their own scripts and styles, the logo and favicon, the three Store files the home page's search box is built from, and what search engines read. */
export const PUBLIC_FILES = new Set([
  '/landing.css', '/landing.js', '/config.js', '/analytics.js', '/site.css', '/favicon.svg', '/tourguid-mark-on-dark.svg', '/robots.txt', '/sitemap.xml',
  '/store/date-range.js', '/store/place-autocomplete.js', '/store/place-autocomplete.css',
]);
/** The two routes the home page's search box asks for suggestions (place-autocomplete.js). Everything else under /api/ is gated. */
export const PUBLIC_ROUTES = new Set(['/api/store/suggest', '/api/store/airports']);
/** Photos and icons under /assets/ and the font under /fonts/. By kind, not the whole folder: /assets/ also holds a register and a credits sheet that no page loads. */
export const PUBLIC_FOLDERS = [
  { prefix: '/assets/', kind: /\.(?:png|jpe?g|svg|webp)$/ },
  { prefix: '/fonts/', kind: /\.woff2$/ },
];

/** True when a visitor needs the password for this path. Default-deny: only the lists above are open, and a path that tries to be clever (encoded dots or slashes, doubled slashes) is not on them. */
export function needsGate(pathname) {
  if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) return false;
  if (/%2e|%2f|%5c|%00|\\|\/\//i.test(pathname)) return true;
  const p = canonicalPath(pathname);
  if (PUBLIC_PAGES.has(p) || PUBLIC_FILES.has(p) || PUBLIC_ROUTES.has(p)) return false;
  return !PUBLIC_FOLDERS.some(({ prefix, kind }) => p.startsWith(prefix) && kind.test(p) && !p.includes('..'));
}

/** Where to go after the password: an address on this site only, never the gate's own paths, never another host. */
export function safeNext(raw) {
  const fallback = '/store/';
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) return fallback;
  if (!/^\/(?![/\\])[^\s\u0000-\u001f\\]*$/.test(raw)) return fallback;
  if (raw === LOGIN_PATH || raw.startsWith(`${LOGIN_PATH}/`) || raw.startsWith(`${LOGIN_PATH}?`)) return fallback;
  return raw;
}

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Compares two strings in time that does not depend on where they first differ. */
function sameText(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** The password check: both sides are hashed first, so neither length nor content shows in how long the comparison takes. */
async function samePassword(given, expected) {
  const a = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(given))));
  const b = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(expected))));
  return sameText(a, b);
}

export async function makeCookieValue(password, nowMs) {
  const payload = `v1.${Math.floor(nowMs / 1000) + MAX_AGE}`;
  return `${payload}.${b64url(await hmac(password, `tg-gate|${payload}`))}`;
}

export async function cookieValueIsGood(value, password, nowMs) {
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value || '');
  if (!m) return false;
  const now = Math.floor(nowMs / 1000);
  const expires = Number(m[1]);
  if (expires <= now || expires > now + MAX_AGE + 60) return false;
  return sameText(b64url(await hmac(password, `tg-gate|v1.${m[1]}`)), m[2]);
}

function cookieOf(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

const configured = (password) => typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;

const PRIVATE_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};
// The page that holds the password form is the one answer that must NOT say no-referrer: a browser that follows that policy sends "Origin: null" with a form post, and the login check below would
// have nothing to compare. same-origin keeps the real Origin for our own post and sends nothing anywhere else.
const PAGE_HEADERS = {
  ...PRIVATE_HEADERS,
  'referrer-policy': 'same-origin',
  'content-type': 'text/html; charset=utf-8',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function gatePageHtml({ next, state }) {
  const closed = state === 'closed';
  const body = closed
    ? `<h1>Not open yet.</h1><p>This part of TourGuid is closed while we finish setting it up. Please come back soon.</p>`
    : `<h1>This part of TourGuid isn&rsquo;t open yet.</h1>
    <p>TourGuid is in pre-launch testing. If you were given a password, enter it to continue.</p>
    <form method="post" action="${LOGIN_PATH}">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="pw">Password</label>
      <input id="pw" name="password" type="password" autocomplete="current-password" required${state === 'wrong' ? ' autofocus aria-invalid="true" aria-describedby="why"' : ''}>
      ${state === 'wrong' ? '<p class="why" id="why" role="alert">That password isn&rsquo;t right. Try again.</p>' : ''}
      ${state === 'slow' ? '<p class="why" id="why" role="alert">Too many tries. Wait a minute and try again.</p>' : ''}
      <button type="submit">Continue</button>
    </form>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Not open yet | TourGuid</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  @font-face { font-family: "Inter"; src: url("/fonts/inter-var.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
  :root { --ink: #123642; --muted: #5c7278; --deep: #075d61; --paper: #fffdf8; --line: #7a948e; --bad: #b42318; --coral: #f33b36; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: var(--paper); color: var(--ink); font: 16px/1.5 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  header { background: linear-gradient(105deg, #103944 0%, #103b43 58%, #14584a 100%); }
  .bar { width: min(1180px, calc(100% - 28px)); min-height: 72px; margin: 0 auto; display: flex; align-items: center; }
  .brand { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; color: #fff; text-decoration: none; font-weight: 850; font-size: 1.35rem; letter-spacing: -.04em; }
  .brand img { width: 38px; height: 38px; display: block; }
  main { flex: 1; width: min(30rem, calc(100% - 40px)); margin: 0 auto; padding: 56px 0 64px; }
  h1 { margin: 0 0 14px; font-size: clamp(1.7rem, 6vw, 2.3rem); line-height: 1.12; letter-spacing: -.03em; font-weight: 800; text-wrap: balance; }
  p { margin: 0 0 18px; color: var(--muted); }
  label { display: block; margin: 22px 0 6px; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  input[type=password] { display: block; width: 100%; height: 48px; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); font: inherit; }
  input[aria-invalid=true] { border: 2px solid var(--bad); }
  .why { margin: 8px 0 0; color: var(--bad); font-weight: 700; font-size: .9rem; }
  button { margin-top: 18px; min-height: 48px; padding: 0 24px; border: 2px solid var(--deep); border-radius: 6px; background: var(--deep); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover { background: #064c4f; border-color: #064c4f; }
  a { color: var(--deep); font-weight: 600; }
  .back { margin-top: 34px; }
  :focus-visible { outline: 3px solid var(--coral); outline-offset: 3px; }
  header :focus-visible { outline-color: #ffae19; }
</style>
</head>
<body>
<header><div class="bar"><a class="brand" href="/"><img src="/tourguid-mark-on-dark.svg" alt="" width="38" height="38"><span>TourGuid</span></a></div></header>
<main>
    ${body}
    <p class="back"><a href="/">Back to the home page</a></p>
</main>
</body>
</html>
`;
}

function pageResponse(request, { next = '/store/', state = 'ask', status = 401, extra = {} }) {
  return new Response(request.method === 'HEAD' ? null : gatePageHtml({ next, state }), { status, headers: { ...PAGE_HEADERS, ...extra } });
}

function textResponse(request, status, text, extra = {}) {
  return new Response(request.method === 'HEAD' ? null : text, { status, headers: { ...PRIVATE_HEADERS, ...extra, 'content-type': 'text/plain; charset=utf-8' } });
}

function wantsPage(request) {
  return (request.method === 'GET' || request.method === 'HEAD') && (request.headers.get('accept') || '').includes('text/html');
}

/** The refusal for a gated address: the page for a browser, JSON for the API, plain text for the rest. Always noindex, and 401 unless the gate itself is not set up (503). */
function refuse(request, url, state, status, extra = {}) {
  if (wantsPage(request)) return pageResponse(request, { next: safeNext(url.pathname + url.search), state, status, extra });
  const text = state === 'closed' ? 'This part of TourGuid is closed while it is being set up.' : 'This part of TourGuid is not open yet.';
  if (url.pathname.startsWith('/api/')) {
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: text }), { status, headers: { ...PRIVATE_HEADERS, ...extra, 'content-type': 'application/json; charset=utf-8' } });
  }
  return textResponse(request, status, text, extra);
}

/** A post to the login must come from this site. Browsers say so in Sec-Fetch-Site; one that does not (older ones, curl) is judged by Origin, and no Origin at all is allowed. */
function postIsFromThisSite(request, url) {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function underLimit(env, request) {
  if (!env.GATE_LIMITER || typeof env.GATE_LIMITER.limit !== 'function') return true;
  try {
    const { success } = await env.GATE_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
    return success !== false;
  } catch {
    return true;   // a broken limiter must not lock everyone out: the password is still required
  }
}

async function login(request, env, url, o) {
  const open = configured(env.GATE_PASSWORD);
  if (request.method === 'GET' || request.method === 'HEAD') {
    return pageResponse(request, { next: safeNext(url.searchParams.get('next')), state: open ? 'ask' : 'closed', status: open ? 200 : 503 });
  }
  if (request.method !== 'POST') return textResponse(request, 405, 'Method not allowed', { allow: 'GET, HEAD, POST' });
  if (!open) return pageResponse(request, { state: 'closed', status: 503, extra: { 'retry-after': '3600' } });
  if (!postIsFromThisSite(request, url)) return textResponse(request, 403, 'Forbidden');
  const stated = request.headers.get('content-length');
  const length = stated && /^\d{1,9}$/.test(stated.trim()) ? Number(stated) : NaN;   // no stated size, or a strange one, is not read: Number(null) would be 0 and pass
  if (!Number.isFinite(length) || length > MAX_FORM_BYTES) return textResponse(request, 413, 'Request too large');
  if (!(await underLimit(env, request))) return pageResponse(request, { state: 'slow', status: 429, extra: { 'retry-after': '60' } });
  let form;
  try { form = await request.formData(); } catch { form = new FormData(); }
  const next = safeNext(String(form.get('next') ?? ''));
  if (!(await samePassword(String(form.get('password') ?? ''), env.GATE_PASSWORD))) {
    if (o.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, o.delayMs));
    return pageResponse(request, { next, state: 'wrong', status: 401 });
  }
  const value = await makeCookieValue(env.GATE_PASSWORD, o.now());
  return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, location: next, 'set-cookie': `${COOKIE_NAME}=${value}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax` } });
}

function logout(request) {
  const headers = { ...PRIVATE_HEADERS, location: '/' };
  if (request.method === 'POST') headers['set-cookie'] = `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return new Response(null, { status: 303, headers });
}

/**
 * The gate. Returns a Response when the request must stop here (the gate's own pages, a refusal, a closed gate), or null when it may carry on to the site: the path is public, or the
 * visitor holds a good cookie.
 */
export async function gate(request, env, opts = {}) {
  const o = { now: opts.now || Date.now, delayMs: opts.delayMs ?? 400 };
  const url = new URL(request.url);
  if (url.pathname === LOGIN_PATH) return login(request, env, url, o);
  if (url.pathname === LOGOUT_PATH) return logout(request);
  if (!needsGate(url.pathname)) return null;
  const password = env.GATE_PASSWORD;
  if (!configured(password)) return refuse(request, url, 'closed', 503, { 'retry-after': '3600' });
  if (await cookieValueIsGood(cookieOf(request, COOKIE_NAME), password, o.now())) return null;
  return refuse(request, url, 'ask', 401);
}

/** What a gated page that DID get through is marked with: never indexed, never shared-cached, and told apart by the cookie. */
export function markPrivate(response) {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  headers.set('cache-control', 'private, no-store');
  headers.append('vary', 'Cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Runs the site (next) only for a request the gate lets through, and marks what it answers for a gated address as private. The gate's own answers never reach the site's analytics or anything else. */
export async function gated(request, env, next, opts) {
  const stop = await gate(request, env, opts);
  if (stop) return stop;
  const response = await next();
  return needsGate(new URL(request.url).pathname) ? markPrivate(response) : response;
}
