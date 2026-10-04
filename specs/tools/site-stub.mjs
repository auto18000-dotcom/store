// A local tourguid.net for looking at pages the way the live one serves them: public/ with the _headers rules (the CSP above all, which is why this exists: a page that works on a plain
// file server can be dead behind the real policy, as the homepage Search button was) and Cloudflare's default asset URLs (auto-trailing-slash).
//   /x.html -> 307 /x      /dir/index.html -> 307 /dir/      /x serves x.html      /dir -> 307 /dir/      anything else 404
// /api/store/* answers an empty, valid JSON so a page's script runs. Not the Worker: nothing here proves a Worker route.
// Usage: node specs/tools/site-stub.mjs [public dir] [port]      (defaults: ./public and 8120)
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'public');
const PORT = Number(process.argv[3] ?? 8120);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values' };

// _headers: a path pattern on its own line, then indented "Name: value" lines. Only /* and /prefix/* patterns are used in this repo.
const rules = [];
for (const block of readFileSync(join(ROOT, '_headers'), 'utf8').split(/\r?\n\r?\n/)) {
  const lines = block.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) continue;
  const pattern = lines[0].trim();
  rules.push({ pattern, headers: lines.slice(1).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }) });
}
const matches = (pattern, path) => (pattern === '/*' ? true : pattern.endsWith('/*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path);
const headersFor = (path) => Object.fromEntries(rules.filter((r) => matches(r.pattern, path)).flatMap((r) => r.headers).map(([k, v]) => [k.toLowerCase(), v]));

const send = (res, code, body, type, path, extra = {}) => {
  res.writeHead(code, { ...headersFor(path), 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
};

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith('/api/')) return send(res, 200, JSON.stringify({ ok: true, items: [], categories: {}, stays: [], providers: [] }), 'application/json', path);
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return send(res, 404, 'not found', 'text/plain', path);
  const redirect = (to) => { res.writeHead(307, { location: to + url.search, ...headersFor(path) }); res.end(); };
  if (path.endsWith('/index.html')) return redirect(path.slice(0, -'index.html'.length));
  if (path.endsWith('.html') && path !== '/') return redirect(path.slice(0, -'.html'.length));
  if (path.endsWith('/')) {
    const index = join(file, 'index.html');
    return existsSync(index) ? send(res, 200, readFileSync(index), TYPES['.html'], path) : send(res, 404, 'not found', 'text/plain', path);
  }
  if (existsSync(file) && statSync(file).isDirectory()) return existsSync(join(file, 'index.html')) ? redirect(path + '/') : send(res, 404, 'not found', 'text/plain', path);
  if (existsSync(file)) return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream', path);
  if (existsSync(file + '.html')) return send(res, 200, readFileSync(file + '.html'), TYPES['.html'], path);
  send(res, 404, 'not found', 'text/plain', path);
}).listen(PORT, () => console.log(`site stub for ${ROOT} on ${PORT}`));
