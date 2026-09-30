// Entry point. Wraps the Store Worker (src/store-worker.js, kept exactly as supplied) so that every
// /api/store/* request also leaves ONE anonymous event in Cloudflare Analytics Engine, and so every HTML
// page gets the Cloudflare Web Analytics beacon injected deliberately -- never Cloudflare's own zone-wide
// auto-injection, which was turned off precisely because it had no way to skip app.tourguid.net's
// token-bearing pages. This repo IS the boundary: it only ever serves tourguid.net, so "never
// app.tourguid.net" needs no runtime check here -- there is no code path in this Worker that can reach it.
//
// What the /api/store/* counter records: which route was asked, the outcome, the country Cloudflare
// places the request in, a coarse client class (bot / browser / unknown), the trip type for flight
// searches, the destination name for provider searches, and how long it took. What is NEVER recorded: IP
// address, cookies, the raw user-agent, the text someone typed into an autocomplete box, dates, passenger
// counts, or any identifier that could follow a person from one visit to the next.
import worker from './store-worker.js';

// Owner, 2026-09-30: "public marketing pages only, never app.tourguid.net" -- restoring analytics now that
// the token-exposure problem it was a workaround for is being fixed at the source (TGSEC-001, in
// progress) rather than papered over by leaving analytics off. Manual, scoped injection replaces
// Cloudflare's zone-wide auto-injection, which is the whole point: this repo has no gated or
// session-bearing page today, so every HTML response it serves is a fair target, and the one class of
// page this must never reach (app.tourguid.net) isn't reachable from this Worker at all.
const CF_BEACON_SNIPPET = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "e4bb890710c04bde8cd90c983cfe7db1"}'></script>`;

class HeadInjector {
  element(el) {
    el.append(CF_BEACON_SNIPPET, { html: true });
  }
}
const analyticsRewriter = new HTMLRewriter().on('head', new HeadInjector());

const BOT_UA = /bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|headless|scrapy|axios|node-fetch|go-http-client|okhttp|libwww|facebookexternalhit|preview/i;

// Routes whose `destination` parameter is a place name (never personal), and so worth counting.
const PLACE_ROUTES = new Set(['feed', 'hotels', 'activities', 'places', 'flights', 'hero-photo', 'destinations']);

function clientClass(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!ua) return 'unknown';
  return BOT_UA.test(ua) ? 'bot' : 'browser';
}

function tripType(params) {
  if (params.get('slices')) return 'multi_city';
  return params.get('return') ? 'round_trip' : 'one_way';
}

function record(env, request, path, status, startedAt, note) {
  if (!env.STATS) return;
  try {
    const url = new URL(request.url);
    const route = path.replace('/api/store/', '').slice(0, 40);
    const params = url.searchParams;
    const destination = PLACE_ROUTES.has(route) ? (params.get('destination') || '').trim().slice(0, 60) : '';
    env.STATS.writeDataPoint({
      indexes: [route],
      blobs: [
        route,
        String(status),
        `${Math.floor(status / 100)}xx`,
        (request.cf && request.cf.country) || 'XX',
        clientClass(request),
        route === 'flights' ? tripType(params) : '',
        destination,
        (note || '').slice(0, 60),
      ],
      doubles: [Date.now() - startedAt, status],
    });
  } catch {
    // Counting must never break a request.
  }
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const response = await worker.fetch(request, env, ctx);
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/store/')) {
      record(env, request, path, response.status, startedAt, response.headers.get('x-tourguid-note'));
      return response;
    }
    const contentType = response.headers.get('content-type') || '';
    if (request.method === 'GET' && contentType.startsWith('text/html')) {
      return analyticsRewriter.transform(response);
    }
    return response;
  },
};
