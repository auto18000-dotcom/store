// Which tourguid.net pages another site may put in a frame, and which one.
//
// Everything on tourguid.net is blocked from framing by default: public/_headers sends X-Frame-Options: DENY and a Content-Security-Policy ending in frame-ancestors 'none' on every
// page. The owner asked (2026-10-07, relayed by TourGuid-Security) for Figma to be able to embed the PUBLIC pages, so the design work can sit next to the real site. The same day the owner
// closed everything but the home page behind a password (src/gate.js), so the home page is now the only public page and the only one listed. This file is the one place that lets framing
// through, and it lets it narrowly:
//
//   * Only the pages listed in FIGMA_FRAMEABLE, one by one. Not a folder, not a pattern: a page added to the site later is blocked until someone adds it here on purpose, and
//     test/frame-policy.test.mjs fails when a page is in neither list, so the question cannot be skipped.
//   * Only to Figma's two exact origins. Not *.figma.com, not a wildcard. If the embed is still refused, the browser console names the origin it tried from, and that exact value is
//     added after measuring it, not guessed.
//   * X-Frame-Options is REMOVED on those pages and frame-ancestors names Figma. XFO has no allowlist (ALLOW-FROM is ignored by modern browsers), so leaving DENY beside a permissive
//     frame-ancestors would let the page frame in some browsers and refuse in others.
//   * Only for a successful HTML page read (GET or HEAD, status 200). Redirects, errors, JSON and everything the Worker answers on /api and /go keep what they have.
//   * It changes nothing at all unless the policy it finds is the one it knows (frame-ancestors 'none'); if the header ever looks different, the page stays as it came.
//
// Never list a page that signs anyone in, holds a session, takes a payment or changes an account. There is none on tourguid.net today (store/auth.js, the sign-in box, is loaded by no page),
// and app.tourguid.net, which does hold sessions, is a different Worker that this file cannot reach.

export const FIGMA_ORIGINS = ['https://www.figma.com', 'https://figma.com'];

/** The public, read-only pages Figma may frame, by their clean address. Since 2026-10-07 only the home page is public (src/gate.js); the Store pages Figma used to frame are behind the password. */
export const FIGMA_FRAMEABLE = new Set([
  '/',
]);

const BEHIND_THE_GATE = 'behind the pre-launch password (src/gate.js): not public, so not framed by anyone; list it above again only when the gate comes off';

/** Pages that exist and stay blocked on purpose, each with the reason, so a reader (and the test) can tell "decided" from "forgotten". */
export const NEVER_FRAMEABLE = new Map([
  ['/404', 'an error page, never a result worth framing'],
  ['/under-construction', 'where the sign-up and sign-in buttons lead: the first page here that a real account flow would replace'],
  ['/store/member-account', 'the account route: a placeholder today, a signed-in page later'],
  ['/store/journey-building', 'the planner: takes the traveller\'s own answers and keeps a journey in the browser'],
  ['/store', BEHIND_THE_GATE],
  ['/store/explore', BEHIND_THE_GATE],
  ['/store/hotels', BEHIND_THE_GATE],
  ['/store/flights', BEHIND_THE_GATE],
  ['/store/activities', BEHIND_THE_GATE],
  ['/store/food', BEHIND_THE_GATE],
  ['/store/places', BEHIND_THE_GATE],
  ['/store/community', BEHIND_THE_GATE],
  ['/store/hotel', BEHIND_THE_GATE],
  ['/store/detail', BEHIND_THE_GATE],
  ['/store/flight-detail', BEHIND_THE_GATE],
]);

/** "/store/hotels.html", "/store/hotels/" and "/store/hotels" are one page; "/store/index.html" is "/store". */
export function canonicalPath(pathname) {
  let p = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

const NONE = /(^|;)(\s*)frame-ancestors\s+'none'\s*(?=;|$)/;

/** The response for this request, with Figma allowed to frame it when the page is on the list and the response is an ordinary page; otherwise the very same response. */
export function figmaFrameResponse(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response;
  if (response.status !== 200) return response;
  if (!(response.headers.get('content-type') || '').startsWith('text/html')) return response;
  if (!FIGMA_FRAMEABLE.has(canonicalPath(new URL(request.url).pathname))) return response;
  const csp = response.headers.get('content-security-policy');
  if (!csp || !NONE.test(csp)) return response;   // not the policy this file was written against: touch nothing
  const headers = new Headers(response.headers);
  headers.delete('x-frame-options');
  headers.set('content-security-policy', csp.replace(NONE, (_all, lead, space) => `${lead}${space}frame-ancestors ${FIGMA_ORIGINS.join(' ')}`));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
