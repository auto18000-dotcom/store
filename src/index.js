// Entry point. Wraps the Store Worker (src/store-worker.js, kept exactly as supplied) so that every
// /api/store/* request also leaves ONE anonymous event in Cloudflare Analytics Engine.
//
// What is recorded: which route was asked, the outcome, the country Cloudflare places the request in,
// a coarse client class (bot / browser / unknown), the trip type for flight searches, the destination
// name for provider searches, and how long it took. What is NEVER recorded: IP address, cookies, the
// raw user-agent, the text someone typed into an autocomplete box, dates, passenger counts, or any
// identifier that could follow a person from one visit to the next.
//
// Page views of the static site do not reach this code (Cloudflare serves those files directly);
// they are counted by Cloudflare Web Analytics and zone analytics.
import worker from './store-worker.js';

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
    }
    return response;
  },
};
