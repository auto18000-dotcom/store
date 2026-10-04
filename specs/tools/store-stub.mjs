// A local Store for the supplier-link work: serves TourGuid-Web/public the way the live one does (the _headers CSP, clean URLs,
// /store/ paths) and answers /api/store/feed with one bookable Viator item, one hostile address and one place, for every row.
// /api/store/go mirrors the Worker's rule closely enough to follow a click: allow-listed host -> 302, anything else -> 400.
// Port 8115.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const ROOT = 'C:\\Claude\\TourGuid-Web\\public';
const headers = readFileSync(join(ROOT, '_headers'), 'utf8');
const CSP = /Content-Security-Policy: (.+)/.exec(headers)[1].trim();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };
const HOSTS = new Set(['viator.com', 'www.viator.com', 'expedia.com', 'www.expedia.com', 'getyourguide.com', 'www.getyourguide.com', 'opentable.com', 'www.opentable.com', 'duffel.com', 'links.duffel.com', 'maps.google.com', 'www.google.com']);
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const items = (category) => [
  { id: 'v1', category, title: `Seine evening cruise (${category})`, source: 'Viator', type: null, summary: 'A sample bookable tour.', bookable: true, price: 89, currency: 'USD', rating: 4.6, reviewCount: 1280, durationMinutes: 120, url: 'https://www.viator.com/tours/Paris/Seine/d479-1P1?pid=P00012345&mcid=42383&medium=link' },
  { id: 'x1', category, title: `Hostile address from data (${category})`, source: 'Viator', type: null, summary: 'Must never be linked directly.', bookable: true, price: 1, currency: 'USD', url: 'https://evil.example/phish?x=1' },
  { id: 'g1', category, title: `Eiffel Tower (${category})`, source: 'Google Places', type: 'Landmark', summary: 'A place, not bookable.', bookable: false, url: 'https://www.google.com/maps/place/Eiffel+Tower' },
  { id: 'n1', category, title: `No address at all (${category})`, source: 'Viator', type: null, summary: 'No url.', bookable: true, price: 5, currency: 'USD', url: null },
];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/store/feed') {
    const cats = (u.searchParams.get('categories') || '').split(',').filter(Boolean);
    return send(res, 200, { categories: Object.fromEntries(cats.map((c) => [c, { live: true, items: items(c) }])) });
  }
  if (u.pathname === '/api/store/go') {
    let host = null;
    try { const t = new URL(u.searchParams.get('url') || ''); if (t.protocol === 'https:' && !t.username) host = t.hostname; } catch {}
    if (!host || !HOSTS.has(host)) return send(res, 400, { error: 'not_a_supplier', message: 'That link is not one we hand off to.' });
    res.writeHead(302, { location: u.searchParams.get('url'), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-tourguid-referral': 'not-recorded' });
    return res.end();
  }
  if (u.pathname === '/api/store/flights') {
    return send(res, 200, { liveMode: true, origin: 'SFO', destination: 'CDG', trip: 'one_way', offers: [
      { operatingCarrier: 'Air France', origin: 'SFO', destination: 'CDG', departure: '2026-11-01T16:00:00', arrival: '2026-11-02T11:30:00', duration: 'PT10H30M', stops: 0, totalAmount: '842.10', currency: 'USD', fareBrand: 'Standard', baggage: [{ type: 'checked', quantity: 1 }, { type: 'carry_on', quantity: 1 }], segments: [{ origin: 'SFO', destination: 'CDG', departure: '2026-11-01T16:00:00', arrival: '2026-11-02T11:30:00', duration: 'PT10H30M', carrier: 'Air France', flightNumber: '83', cabin: 'Economy', baggage: [{ type: 'checked', quantity: 1 }, { type: 'carry_on', quantity: 1 }] }], returnSegments: [] },
    ] });
  }
  if (u.pathname === '/api/store/providers') {
    // Sample facts, for looking at the sheet only. Shaped as the Worker's projection sends them.
    return send(res, 200, { providers: [
      { key: 'viator', name: 'Viator', handoffEnabled: true, hosts: ['viator.com'], verified: true, paymentParty: 'Viator Test Entity Ltd (sample)', fundsRecipient: 'Viator Settlement Services Ltd (sample)', termsUrl: 'https://www.viator.com/support/termsAndConditions', termsVersion: '2026-09', cancellationUrl: 'https://www.viator.com/support/cancellation-policy', support: { url: 'https://www.viator.com/support', email: 'support@viator.example', phone: '+1 888 651 9785', address: '1 Sample Street, Anytown, 00000' } },
      { key: 'tiqets', name: 'Tiqets', handoffEnabled: false, hosts: ['tiqets.com'], verified: false },
    ] });
  }
  if (u.pathname.startsWith('/api/')) return send(res, 200, { ok: true, items: [], categories: {}, stays: [] });
  let p = decodeURIComponent(u.pathname).replace(/^\/store(?=\/|$)/, '') || '/';
  if (p === '/') p = '/index.html';
  let f = join(ROOT, 'store', p);
  if (!existsSync(f) && existsSync(f + '.html')) f += '.html';
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) f = join(ROOT, p);
  if (!existsSync(f) || statSync(f).isDirectory()) return send(res, 404, 'not found', 'text/plain');
  send(res, 200, readFileSync(f), TYPES[extname(f)] ?? 'application/octet-stream');
}).listen(8115, () => console.log('store stub with supplier-link feed on 8115'));
