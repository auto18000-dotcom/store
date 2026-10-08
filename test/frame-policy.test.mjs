// Which pages Figma may frame (src/frame-policy.js), and that everything else stays blocked.
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGMA_FRAMEABLE, FIGMA_ORIGINS, NEVER_FRAMEABLE, canonicalPath, figmaFrameResponse } from '../src/frame-policy.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const headersFile = fs.readFileSync(path.join(root, 'public', '_headers'), 'utf8');
// The policy the site really sends, read from public/_headers, so the test runs against what is sent and not against a copy of it.
const siteCsp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(headersFile)[1].trim();
const figma = `frame-ancestors ${FIGMA_ORIGINS.join(' ')}`;

/** A request and the response the Store Worker and the asset headers would hand back for it. */
function pageRead(pathname, { status = 200, type = 'text/html; charset=utf-8', method = 'GET', csp = siteCsp, xfo = 'DENY' } = {}) {
  const headers = new Headers({ 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  if (xfo) headers.set('x-frame-options', xfo);
  if (csp) headers.set('content-security-policy', csp);
  const body = [204, 205, 304].includes(status) ? null : '<!doctype html><title>x</title>';   // these statuses carry no body
  return [new Request(`https://tourguid.net${pathname}`, { method }), new Response(body, { status, headers })];
}

test('the premise: public/_headers blocks framing on every page, with X-Frame-Options and with frame-ancestors none', () => {
  assert.match(headersFile, /^\/\*\s*\n(?:\s+.+\n)*?\s+X-Frame-Options: DENY$/m);
  assert.match(siteCsp, /(^|;)\s*frame-ancestors 'none'\s*$/);
});

test('every page in public/ is decided: listed as frameable or listed as blocked on purpose, never both, never neither, and nothing listed that does not exist', () => {
  const pages = [];
  const walk = (dir) => { for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name); if (fs.statSync(p).isDirectory()) walk(p); else if (name.endsWith('.html')) pages.push(canonicalPath('/' + path.relative(path.join(root, 'public'), p).split(path.sep).join('/'))); } };
  walk(path.join(root, 'public'));
  assert.ok(pages.length >= 14, `found ${pages.length} pages`);
  for (const p of pages) {
    const yes = FIGMA_FRAMEABLE.has(p), no = NEVER_FRAMEABLE.has(p);
    assert.ok(yes !== no, `${p} must be in exactly one list in src/frame-policy.js (frameable: ${yes}, blocked on purpose: ${no}). A new page is blocked until it is listed; list it only if it signs no one in, holds no session and changes nothing.`);
  }
  for (const p of [...FIGMA_FRAMEABLE, ...NEVER_FRAMEABLE.keys()]) assert.ok(pages.includes(p), `${p} is listed but is not a page`);
  for (const [p, why] of NEVER_FRAMEABLE) assert.ok(why.length > 10, `${p} needs its reason written down`);
});

test('a listed page can be framed by Figma and by nobody else: X-Frame-Options gone, frame-ancestors names the two exact origins, the rest of the policy is untouched', async () => {
  assert.deepEqual(FIGMA_ORIGINS, ['https://www.figma.com', 'https://figma.com']);
  for (const p of FIGMA_FRAMEABLE) {
    const [request, response] = pageRead(p);
    const out = figmaFrameResponse(request, response);
    assert.equal(out.headers.get('x-frame-options'), null, `${p}: X-Frame-Options has no allowlist, so it must be gone`);
    const csp = out.headers.get('content-security-policy');
    assert.equal(csp, siteCsp.replace("frame-ancestors 'none'", figma), `${p}: only frame-ancestors changes`);
    const ancestors = /frame-ancestors ([^;]*)/.exec(csp)[1].trim().split(/\s+/);
    assert.deepEqual(ancestors, FIGMA_ORIGINS, p);
    assert.ok(ancestors.every((o) => /^https:\/\/[a-z.]+$/.test(o) && !o.includes('*')), `${p}: no wildcard`);
    assert.equal(out.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(out.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(out.status, 200);
    assert.equal(await out.text(), '<!doctype html><title>x</title>', `${p}: the page itself is unchanged`);
  }
});

test('the other spellings of a listed page are the same page', () => {
  assert.equal(canonicalPath('/store/hotels'), '/store/hotels');
  assert.equal(canonicalPath('/store/hotels.html'), '/store/hotels');
  assert.equal(canonicalPath('/store/hotels/'), '/store/hotels');
  assert.equal(canonicalPath('/store/'), '/store');
  assert.equal(canonicalPath('/store/index.html'), '/store');
  assert.equal(canonicalPath('/index.html'), '/');
  assert.equal(canonicalPath('/'), '/');
  assert.equal(canonicalPath('/store//'), '/store');
});

test('a page that is not on the list keeps both blocks: the ones blocked on purpose, new pages, the account and sign-in addresses, the API', () => {
  const unlisted = [...NEVER_FRAMEABLE.keys(), '/store/sign-in', '/account', '/login', '/checkout', '/store/checkout', '/api/store/hotels', '/go', '/anything-new', '/storefront', '/store/hotels-secret'];
  for (const p of unlisted) {
    const [request, response] = pageRead(p);
    const out = figmaFrameResponse(request, response);
    assert.equal(out, response, `${p}: the very same response`);
    assert.equal(out.headers.get('x-frame-options'), 'DENY', p);
    assert.match(out.headers.get('content-security-policy'), /frame-ancestors 'none'/, p);
  }
});

test('only an ordinary good read of a page is changed: not a POST, an error, a redirect, JSON or an image', () => {
  const cases = [
    ['POST', '/', { method: 'POST' }], ['404', '/store/hotels', { status: 404 }], ['redirect', '/store/hotels', { status: 307 }], ['304', '/store/hotels', { status: 304 }],
    ['JSON', '/store/hotels', { type: 'application/json' }], ['image', '/', { type: 'image/svg+xml' }], ['no content type', '/', { type: '' }],
  ];
  for (const [label, p, opts] of cases) {
    const [request, response] = pageRead(p, opts);
    const out = figmaFrameResponse(request, response);
    assert.equal(out, response, label);
  }
  const [head, headResponse] = pageRead('/', { method: 'HEAD' });
  assert.equal(figmaFrameResponse(head, headResponse).headers.get('x-frame-options'), null, 'a HEAD of a listed page gets the same headers as the GET');
});

test('if the policy is not the one this file was written against, nothing is loosened', () => {
  for (const csp of [null, '', "default-src 'none'", "default-src 'none'; frame-ancestors 'self'", "default-src 'none'; frame-ancestors https://example.com", siteCsp.replace("frame-ancestors 'none'", '')]) {
    const [request, response] = pageRead('/', { csp });
    const out = figmaFrameResponse(request, response);
    assert.equal(out, response, String(csp));
    assert.equal(out.headers.get('x-frame-options'), 'DENY');
  }
});

test('the Worker really uses it, on everything it answers, before the analytics are added', () => {
  const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
  assert.match(index, /import \{ figmaFrameResponse \} from '\.\/frame-policy\.js'/);
  assert.match(index, /const response = figmaFrameResponse\(request, await worker\.fetch\(request, env, ctx\)\)/);
});
