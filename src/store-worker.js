/**
 * STALE COPY — the canonical file is in TourGuid-Web's repository
 * (github.com/auto18000-dotcom/store), which is what deploys. This folder is a
 * mirror of a ChatGPT project and its files may be replaced at any time. Edit
 * there, or send a diff; do not assume a change made here reaches the site.
 *
 * TourGuid Travel Store — the /api/store/* server, as a Cloudflare Worker.
 *
 * This is the deployed twin of `preview_server.py`. The two must agree: the
 * store pages fetch /api/store/* on their OWN origin and never call a provider
 * or Supabase directly, so no credential ever reaches a browser.
 *
 * WHAT THIS CHANGES ABOUT THE SITE. tourguid.net has been assets-only, with
 * "no Worker script, nothing secret here" written into wrangler.jsonc. Adding
 * this script makes that no longer true: the Worker holds STORE_CALLER_SECRET.
 * That is the cost of a Store that searches without making visitors sign in,
 * and it was the owner's decision on 2026-09-22 ("public, with protection").
 * Update the comment in wrangler.jsonc rather than leaving it saying something
 * that has stopped being so.
 *
 * Everything that is not /api/store/* falls through to the static assets, so
 * the site keeps serving exactly as it does today.
 *
 * Secrets, set with `wrangler secret put` and never committed:
 *   STORE_SEARCH_URL      the store-search Edge Function
 *   STORE_CALLER_SECRET   the shared secret store-search requires
 *   PEXELS_API_KEY        hero photos (optional; there is a fallback)
 *
 * Until STORE_SEARCH_URL and STORE_CALLER_SECRET are both set, the search
 * routes answer 503 and the pages keep saying they are not connected. That is
 * deliberate: an invented fare is worse than an empty page. A 401 from
 * store-search means the two secrets do not match.
 */

const FEED_TTL = 3600; // seconds. See feed() for why it is an hour.
const CARD_IMAGE_MIN_WIDTH = 600;
const HERO_TTL = 86400;
// Suggestions take 1.3-3.1s upstream, far too slow to feel like typing. City
// names do not change, so a prefix is cached for a day and the page debounces
// on top. Cached per PREFIX, so "barce" already serves "barcel" and "barcelo".
const SUGGEST_TTL = 86400;

// The hero when no destination has been chosen: travellers, not a city. A set
// the page cycles, rather than one picture — and the QUERY rotates by the day
// so a regular visitor is not met by the same eight photographs forever, while
// everyone on the same day shares one cached answer and one Pexels call.
const HERO_QUERIES = [
  "people travelling",
  "friends cafe travel",
  "couple vacation walking",
  "traveller airport window",
  "family holiday beach",
  "woman exploring city",
  "friends road trip",
];
const SUGGEST_MIN_CHARS = 2;

// NO CURATED FALLBACK PHOTOGRAPH, and no default destination anywhere in this
// file. There used to be one hand-picked Barcelona image used when Pexels had
// nothing; the owner's rule of 2026-09-23 is that no hardcoded Barcelona
// remains in the Store. A city with no photograph now shows no photograph,
// which is honest, where a Barcelona skyline under Porto's name is not.

// Where an outbound click may land. An open redirect on a travel domain is a
// phishing gift — our name and our padlock on someone else's login page — so
// the host is matched exactly and anything else is refused.
const SUPPLIER_HOSTS = {
  "viator.com": "Viator",
  "www.viator.com": "Viator",
  "expedia.com": "Expedia",
  "www.expedia.com": "Expedia",
  "getyourguide.com": "GetYourGuide",
  "www.getyourguide.com": "GetYourGuide",
  "opentable.com": "OpenTable",
  "www.opentable.com": "OpenTable",
  "duffel.com": "Duffel",
  "links.duffel.com": "Duffel",
  "maps.google.com": "Google Maps",
  "www.google.com": "Google Maps",
};

// Which suppliers the LEDGER accepts (migration 355 constrains it to these).
// A provider it does not know is a 400, and a 400 stops the redirect — so a
// Google Maps link must never be sent to it, or "View details" dies on every
// unpriced place, food and hotel card. Google pays no commission and has
// nothing to attribute. Expedia joined in migration 356: the owner's Travel
// Shop earns up to 4% and there is no Expedia API account, so a recorded click
// is the ONLY evidence we will ever hold that we sent someone there.
const LEDGER_PROVIDERS = {
  Viator: "viator",
  GetYourGuide: "getyourguide",
  Duffel: "duffel",
  OpenTable: "opentable",
  Expedia: "expedia",
};

const MESSAGES = {
  provider_refused: "This supplier is not available for the store right now.",
  not_connected:
    "Live results are not connected yet. The store-search service is not configured, so nothing is shown rather than something invented.",
  not_allowed:
    "The store's search service refused this server. The shared secret is missing or does not match the one set on store-search.",
  unknown_search: "That search is not one the store offers.",
  busy: "You have made a lot of searches. Please try again shortly.",
  daily_cap: "Search has reached today's limit. Please try again tomorrow.",
  switched_off: "This part of the store is switched off right now.",
  unavailable: "Live results could not be loaded right now.",
};
const STATUS = { busy: 429, daily_cap: 429, unavailable: 502, unknown_search: 404, provider_refused: 503 };

/** Only https, never credentials in the host, never a backslash trick. */
function supplierOf(target) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (String(target).includes("\\")) return null;
  return SUPPLIER_HOSTS[parsed.hostname] || null;
}

function json(body, { status = 200, cache = 0 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A search result carries a price and an expiry. Never cache one at the
      // edge; the feed does its own caching deliberately and separately.
      "Cache-Control": cache ? `public, max-age=${cache}` : "no-store",
    },
  });
}

function refuse(reason) {
  return json(
    { error: reason, message: MESSAGES[reason] || MESSAGES.unavailable },
    { status: STATUS[reason] || 503 }
  );
}

/** Ask store-search for one provider. Returns {payload} or {error}. */
async function askStoreSearch(env, provider, params, request) {
  const url = (env.STORE_SEARCH_URL || "").trim();
  const secret = (env.STORE_CALLER_SECRET || "").trim();
  if (!url || !secret) return { error: "not_connected" };

  const headers = {
    "Content-Type": "application/json",
    // Server to server. This never appears in page source or a browser.
    "x-store-caller": secret,
    // The visitor, not this Worker: store-search rate-limits on a salted hash
    // of it and stores only the hash.
    //
    // MUST be `x-store-visitor`. `x-forwarded-for` is rewritten in transit
    // with the address the platform actually sees — this Worker — so every
    // traveller would share one bucket and the Store would stop searching for
    // everybody after thirty requests an hour. Measured on Dev: twelve
    // distinct addresses collapsed to a single hash. It would have read as a
    // broken feed rather than as a rate limit.
    "x-store-visitor": request.headers.get("cf-connecting-ip") || "",
  };
  const token = request.headers.get("x-turnstile-token");
  if (token) headers["x-turnstile-token"] = token;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ provider, ...params }),
    });
  } catch {
    return { error: "unavailable" };
  }
  if (response.ok) {
    try {
      return { payload: await response.json() };
    } catch {
      return { error: "unavailable" };
    }
  }
  // store-search speaks in plain sentences; a provider's own error text is
  // never forwarded, because Duffel's names the organisation. Its `reason` is
  // read where it sends one: "over the day's budget" and "this visitor is
  // clicking too fast" need different words.
  let reason = "";
  try {
    reason = String(((await response.json()) || {}).reason || "");
  } catch {
    /* no body, or not JSON */
  }
  // store-search names the reason, and the names are not interchangeable:
  //   provider_refused — the provider itself said no, and will keep saying no
  //                      (Duffel 403: Stays is not enabled on the account)
  //   switched_off     — an operator turned the source off in Control, and can
  //                      turn it back on in the next minute
  //   provider_busy    — transient
  // Trust the name over the status code where one is sent; a 403 used to be
  // read as our own misconfiguration, which made a provider's durable refusal
  // look like a bug on our side.
  const NAMED = { provider_refused: 1, switched_off: 1, provider_busy: 1, daily_cap: 1, ip_rate: 1 };
  if (NAMED[reason]) {
    if (reason === "ip_rate") return { error: "busy" };
    if (reason === "provider_busy") return { error: "busy" };
    return { error: reason };
  }
  if (response.status === 401) return { error: "not_allowed" };
  if (response.status === 404) return { error: "unknown_search" };
  if (response.status === 429) return { error: "busy" };
  if (response.status === 503) return { error: "switched_off" };
  return { error: "unavailable" };
}

/* ── mapping: provider shapes into the field names the pages read ────────── */

function flightOffers(payload, from, to, date) {
  const offers = [];
  for (const offer of (payload && payload.offers) || []) {
    const slices = offer.slices || [];
    const segments = (slices[0] && slices[0].segments) || [];
    if (!segments.length) continue;
    const first = segments[0];
    const last = segments[segments.length - 1];
    offers.push({
      id: offer.id,
      operatingCarrier:
        first.operating_carrier_name || first.marketing_carrier_name || offer.owner_name || null,
      origin: first.origin || from,
      destination: last.destination || to,
      // Local wall clocks with no zone, per the traveller_clock law. Do NOT
      // convert them: an airline's times are local to their own airports.
      departure: first.departing_at || date,
      arrival: last.arriving_at || null,
      stops: Math.max(segments.length - 1, 0),
      duration: (slices[0] && slices[0].duration) || null,
      totalAmount: offer.total_amount || null,
      currency: offer.total_currency || null,
      expiresAt: offer.expires_at || null,
      // Nothing links anywhere yet. A detail page is Journey work, and a link
      // invented here would 404 in a visitor's face.
      detailUrl: null,
      // The return leg, when there is one. `segments` stays the OUTBOUND, so
      // nothing reading this today changes; a round trip simply carries more.
      returnSegments: (((offer.slices || [])[1] || {}).segments || []).map((leg) => ({
        origin: leg.origin,
        destination: leg.destination,
        departure: leg.departing_at,
        arrival: leg.arriving_at,
        duration: leg.duration,
        carrier: leg.marketing_carrier_name,
        flightNumber: leg.marketing_carrier_flight_number,
      })),
      returnDuration: ((offer.slices || [])[1] || {}).duration ?? null,
      segments: segments.map((leg) => ({
        origin: leg.origin,
        destination: leg.destination,
        departure: leg.departing_at,
        arrival: leg.arriving_at,
        duration: leg.duration,
        carrier: leg.marketing_carrier_name,
        flightNumber: leg.marketing_carrier_flight_number,
      })),
    });
  }
  return offers;
}

function hotelResults(payload) {
  const stays = (payload && (payload.stays || payload.results)) || [];
  return stays.map((stay) => ({
    id: stay.id,
    name: stay.name,
    rating: stay.rating,
    reviewCount: stay.review_count,
    address: stay.address,
    lat: stay.lat,
    lon: stay.lon,
    photo: stay.photo_url,
    checkInAfter: stay.check_in_after,
    checkOutBefore: stay.check_out_before,
    fromPrice: stay.total_amount,
    currency: stay.total_currency || stay.currency,
  }));
}

/**
 * Viator's `variants` are NOT ordered best-first — a real product came back
 * 100, 200, 400, 360, 480, 540, 674, 720, 210, 75. Taking the first gives a
 * 100px thumbnail, taking the last gives 75px, and either one stretched across
 * every tile looks like a broken feed. Choose by width.
 */
function viatorPhoto(product) {
  const images = product.images;
  if (!Array.isArray(images) || !images.length) return null;
  const cover = images.find((i) => i && i.isCover) || images.find((i) => i) || null;
  const sized = ((cover && cover.variants) || []).filter(
    (v) => v && typeof v.url === "string" && typeof v.width === "number"
  );
  if (!sized.length) return null;
  const bigEnough = sized.filter((v) => v.width >= CARD_IMAGE_MIN_WIDTH);
  const pool = bigEnough.length ? bigEnough : sized;
  const best = bigEnough.length
    ? pool.reduce((a, b) => (a.width <= b.width ? a : b))
    : pool.reduce((a, b) => (a.width >= b.width ? a : b));
  return best.url;
}

/**
 * travel-lookup answers {destination, results, nearby, catalog} where `results`
 * is Viator's OWN payload — an object with a `products` array, not an array —
 * and `nearby` is a row per neighbouring destination carrying its own products.
 * Product objects are Viator's, unrenamed, so every field is read defensively.
 */
function activityResults(payload) {
  const products = [];
  if (payload && typeof payload === "object") {
    const results = payload.results;
    if (results && Array.isArray(results.products)) products.push(...results.products);
    else if (Array.isArray(results)) products.push(...results);
    for (const row of payload.nearby || []) {
      const found = row && row.products;
      if (Array.isArray(found)) products.push(...found);
      else if (found && Array.isArray(found.products)) products.push(...found.products);
    }
  }
  return products.filter(Boolean).map((product) => {
    const pricing = product.pricing || {};
    const reviews = product.reviews || {};
    const duration = product.duration || {};
    return {
      id: product.productCode || product.id || null,
      title: product.title || null,
      summary: product.description || null,
      photo: viatorPhoto(product),
      // COMBINED across providers — Viator's own reviews and Tripadvisor's.
      // A card that prints this beside the word "Viator" alone misattributes
      // thousands of other people's reviews; reviewSources is why.
      rating: reviews.combinedAverageRating ?? null,
      reviewCount: reviews.totalReviews ?? null,
      reviewSources: (reviews.sources || []).filter(Boolean).map((row) => ({
        provider: row.provider
          ? row.provider.charAt(0) + row.provider.slice(1).toLowerCase()
          : null,
        count: row.totalCount,
        rating: row.averageRating,
      })),
      fromPrice: (pricing.summary || {}).fromPrice ?? null,
      currency: pricing.currency || null,
      // Viator has already tagged this with our affiliate ids. Do not rewrite
      // it or strip its query.
      url: product.productUrl || null,
      durationMinutes: duration.fixedDurationInMinutes ?? null,
      instantConfirmation: product.confirmationType === "INSTANT",
    };
  });
}

const textOf = (value) => (value && typeof value === "object" ? value.text : value) || null;

/**
 * travel-lookup answers {places: [...]} — one FLAT list of Google's own
 * objects, not grouped by category. A hotel arrives with a name, address,
 * coordinates, type, a Maps link, a photo and (only when asked for) a rating.
 * No description, no amenities, no price, no availability: Google does not
 * sell rooms.
 */
function placeResults(payload) {
  return ((payload && payload.places) || []).filter(Boolean).map((place) => {
    const photo = place.tourguidPhoto || {};
    const location = place.location || {};
    return {
      id: place.id,
      name: textOf(place.displayName),
      address: place.formattedAddress || null,
      type: textOf(place.primaryTypeDisplayName) || place.primaryType || null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      lat: location.latitude ?? null,
      lon: location.longitude ?? null,
      photo: photo.url || null,
      // Google REQUIRES the photographer's attribution wherever the photo is.
      // A card that drops it breaks the terms the photo was served under.
      photoCredit: photo.author || null,
      photoCreditUrl: photo.authorUri || null,
      url: place.googleMapsUri || null,
      reservable: place.reservable ?? null,
    };
  });
}

/**
 * "Town, Region, Country" — the string every downstream search wants.
 *
 * A BARE NAME IS A GUESS HANDED TO A GEOCODER, AND IT GUESSES TOWARDS THE
 * FAMOUS ONE. "Malay" finds Malaysia rather than Malay, Aklan. There are two
 * Barcelonas — Catalonia and Venezuela — and only the qualifiers tell them
 * apart. Same rule the app learned on 2026-09-17.
 */
function placeLabel(city) {
  const seen = new Set();
  return (
    [city.name, city.region, city.country]
      .map((part) => (part || "").trim())
      .filter((part) => part && !seen.has(part.toLowerCase()) && seen.add(part.toLowerCase()))
      .join(", ") || null
  );
}

function suggestionsOf(payload) {
  return (((payload && payload.cities) || []).filter((city) => city && city.name)).map((city) => ({
    name: city.name,
    region: city.region ?? null,
    country: city.country ?? null,
    countryCode: city.countryCode ?? null,
    lat: city.lat ?? null,
    lon: city.lon ?? null,
    timeZone: city.timeZone ?? null,
    // What the page sends back to every other route. Keeping the whole object,
    // not just the label, is what lets Duffel and the renowned-places search
    // use coordinates rather than a name.
    label: placeLabel(city),
  }));
}

/** Where the traveller actually means, from what the page sends back. */
function contextOf(params) {
  const where = {};
  const city = one(params, "destination");
  const region = one(params, "region");
  const country = one(params, "country");
  if (city) where.city = city;
  if (region) where.region = region;
  if (country) where.country = country;
  const lat = Number(one(params, "lat"));
  const lon = Number(one(params, "lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && one(params, "lat") && one(params, "lon")) {
    where.lat = lat;
    where.lon = lon;
  }
  return where;
}

// A FUNCTION, not a shared constant. A Response body can be consumed once, so
// a module-level Response would serve the first visitor and fail every one
// after it — and only under real traffic, never in a single-request test.
const noDestination = () =>
  json({ error: "no_destination", message: "Choose a destination first." }, { status: 400 });

/** One shape for every carousel card, whatever supplied it. */
function asCard(item, category, source, priced) {
  return {
    id: item.id ?? null,
    category,
    title: item.title || item.name || null,
    summary: item.summary || item.address || null,
    photo: item.photo || null,
    photoCredit: item.photoCredit || null,
    photoCreditUrl: item.photoCreditUrl || null,
    type: item.type || null,
    durationMinutes: item.durationMinutes ?? null,
    instantConfirmation: item.instantConfirmation ?? null,
    reviewSources: item.reviewSources || [],
    rating: item.rating ?? null,
    reviewCount: item.reviewCount ?? null,
    price: priced ? item.fromPrice ?? null : null,
    currency: priced ? item.currency ?? null : null,
    url: item.url || null,
    source,
    // False means a real place with no bookable price. A Google hotel is a
    // listing, not a room for sale, and a card must not imply otherwise.
    bookable: priced,
  };
}

// Each carousel, the provider it prefers, and what it falls back to. A
// fallback is always a REAL source, never invented content: an unpriced Google
// listing is honest, a made-up hotel rate is not.
// withPhotos/withRatings are asked for because a card shows both. Neither is
// free — a photo is a billed Places Photo request and a rating bills the whole
// search at Google's Enterprise tier. That is what the cache pays for.
const GOOGLE_CARD = { withPhotos: true, withRatings: true };

// A provider that just answered "switched off" is skipped briefly, so a burst
// of cold builds stops paying for a call we already know fails.
//
// SIXTY SECONDS, NOT TEN MINUTES, AND THAT IS THE WHOLE POINT. Two different
// things reach us as "switched off" and they are not alike:
//   - a source an operator turned off in Control, which they can turn back on
//     in the next minute;
//   - a provider refusing for its own reasons, such as Duffel answering 403
//     because the account has no Stays entitlement, which stays true until the
//     owner buys it.
// A long memory is right for the second and wrong for the first: an operator
// re-enables a source, reloads, sees nothing, and concludes the switch is
// broken. Since our 503 is the REVERSIBLE one, the memory is kept short enough
// that a switch feels immediate, and the saving still lands where it matters —
// inside one cold build and the few that follow it.
//
// Module-level state is deliberate here and was deliberately NOT used for the
// feed cache. An isolate can vanish between requests, so this is best-effort —
// fine for an optimisation whose failure mode is "do what we did before", and
// not fine for the cache, whose failure mode was multiplying the Google bill.
const REFUSED = new Map();
const REFUSED_MS = 30 * 60 * 1000;
const FEED_PLAN = {
  // nearbyCount does nothing without nearbyMiles: the radius is what turns the
  // neighbouring-destination search on at all.
  activities: [["viator_search", { count: 12, nearbyMiles: 30, nearbyCount: 6 }, "Viator", true]],
  places: [["google_places_search", { category: "attraction", ...GOOGLE_CARD }, "Google Places", false]],
  food: [["google_places_search", { category: "eat", ...GOOGLE_CARD }, "Google Places", false]],
  hotels: [
    ["duffel_stay_search", {}, "Duffel", true],
    ["google_places_search", { category: "stay", ...GOOGLE_CARD }, "Google Places", false],
  ],
};

/* ── routes ──────────────────────────────────────────────────────────────── */

const one = (params, name, fallback = "", limit = 100) =>
  String(params.get(name) ?? fallback).trim().slice(0, limit);

async function flights(env, request, params) {
  const passengers = Number(one(params, "passengers", "1")) || 1;
  const departure = one(params, "departure");

  // WHERE TO, without a table of airport codes. A three-letter destination is
  // taken as an IATA code; anything else is a display name and the COORDINATES
  // decide, which Duffel resolves to the nearest airport itself. That is what
  // lets the page delete its Barcelona/Paris/Lisbon lookup — a hardcoded list
  // of three cities is a Barcelona hardcode wearing a hat, and it silently
  // fails for the fourth city anyone types.
  const raw = params.get("slices");
  if (raw) {
    const { slices, error: badLeg } = legsOf(raw);
    if (badLeg) return json({ error: "bad_journey", message: badLeg }, { status: 400 });
    const { payload, error } = await askStoreSearch(
      env,
      "duffel_flight_offers",
      { slices, adults: passengers, limit: 12 },
      request
    );
    if (error) return refuse(error);
    return json({
      offers: flightOffers(payload, null, null, null),
      legs: payload.legs ?? payload.slices ?? null,
      trip: payload.trip ?? null,
      liveMode: payload.live_mode ?? null,
      captchaChecked: payload.captchaChecked ?? null,
    });
  }

  const returning = one(params, "return") || one(params, "returnDate");

  // BOTH ENDS READ THE SAME WAY: a three-letter value is an IATA code, longer
  // is a display name and the coordinates decide. Duffel resolves the nearest
  // airport itself, which is what lets the pages carry no airport table at all.
  const from = endOf(params, "origin", "originLat", "originLon");
  const to = endOf(params, "destination", "lat", "lon");

  if (!departure) {
    return json({ error: "bad_request", message: "A departure date is required." }, { status: 400 });
  }
  // A return may be the SAME DAY — a day trip is a real thing — but never
  // before the departure. Refused here rather than spending a search.
  if (isDate(departure) && isDate(returning) && returning < departure) {
    return json(
      { error: "bad_dates", message: "A return cannot be before the departure." },
      { status: 400 }
    );
  }
  // NO DEFAULTS AT EITHER END. Neither a code nor a point means we were not
  // told, and saying so beats searching a route nobody asked for.
  if (!from.code && !from.point) {
    return json({ error: "no_origin", message: "Choose where you are flying from." }, { status: 400 });
  }
  if (!to.code && !to.point) return noDestination();

  const { payload, error } = await askStoreSearch(
    env,
    "duffel_flight_offers",
    {
      ...(from.code ? { from: from.code } : {}),
      ...(from.point ? { from_lat: from.lat, from_lon: from.lon } : {}),
      ...(to.code ? { to: to.code } : {}),
      ...(to.point ? { to_lat: to.lat, to_lon: to.lon } : {}),
      date: departure,
      // Optional. A second slice on the SAME offer request, so a round trip is
      // priced as one rather than two one-ways added together — and it costs
      // one search, not two, against the excess-search fee.
      ...(returning ? { return_date: returning } : {}),
      adults: passengers,
      limit: 12,
    },
    request
  );
  if (error) return refuse(error);
  return json({
    offers: flightOffers(payload, from.code || from.named || null, to.code || to.named || null, departure),
    // Which airport Duffel actually resolved the coordinates to. A traveller
    // who typed a city is owed the airport they are being flown into.
    destination: payload.destination ?? null,
    origin: payload.origin ?? null,
    // What was actually SEARCHED, so a dropped return date can never be
    // silent again: a page that asked for a round trip and reads "one_way"
    // knows its second date did not arrive.
    trip: payload.trip ?? null,
    departureDate: payload.departure_date ?? null,
    returnDate: payload.return_date ?? null,
    // Duffel says which mode answered. A test key invents an airline called
    // "Duffel Airways" and synthetic fares; a page that cannot tell the
    // difference will quote them to a real traveller.
    liveMode: payload.live_mode ?? null,
    captchaChecked: payload.captchaChecked ?? null,
  });
}

/**
 * One place, with enough depth for a full page. Google's Place Details object,
 * read the way placeResults reads Search: travel-lookup passes Google's own
 * fields through unrenamed. Everything is optional — a hotel with no website
 * or no editorial summary is ordinary, not an error.
 *
 * ATTRIBUTION IS NOT DECORATION HERE. Photos carry their photographer and
 * reviews carry their author; Google's terms require both to be shown wherever
 * the content is, and this page is the one Google's own reviewers will read.
 */
function placeDetail(payload) {
  let place = payload && payload.place;
  if (!place && payload && payload.id) place = payload;
  if (!place || typeof place !== "object") return null;
  const location = place.location || {};
  const hours = place.regularOpeningHours || {};
  const rawPhotos = place.tourguidPhotos || (place.tourguidPhoto ? [place.tourguidPhoto] : []);
  return {
    id: place.id ?? null,
    name: textOf(place.displayName),
    type: textOf(place.primaryTypeDisplayName) || place.primaryType || null,
    address: place.formattedAddress ?? null,
    lat: location.latitude ?? null,
    lon: location.longitude ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    summary: textOf(place.editorialSummary),
    website: place.websiteUri ?? null,
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    openingHours: hours.weekdayDescriptions || [],
    photos: rawPhotos
      .filter((photo) => photo && photo.url)
      .map((photo) => ({ url: photo.url, credit: photo.author ?? null, creditUrl: photo.authorUri ?? null })),
    reviews: (place.reviews || []).filter(Boolean).map((review) => {
      const author = review.authorAttribution || {};
      return {
        rating: review.rating ?? null,
        text: textOf(review.originalText) || textOf(review.text),
        publishedAt: review.publishTime ?? null,
        author: author.displayName ?? null,
        authorPhoto: author.photoUri ?? null,
        authorUrl: author.uri ?? null,
      };
    }),
    url: place.googleMapsUri ?? null,
    source: "Google Places",
    // Google sells no rooms. A detail page may describe a hotel in full and
    // still must not offer to book it.
    bookable: false,
  };
}

/** A full page for one place, from its Google place id. */
async function detail(env, request, params, ctx) {
  const placeId = one(params, "placeId", "", 200);
  if (!placeId) {
    return json({ error: "no_place", message: "A place id is required." }, { status: 400 });
  }
  const cache = caches.default;
  const key = new Request(`https://detail.tourguid.invalid/${encodeURIComponent(placeId)}`);
  const hit = await cache.match(key);
  if (hit) return json({ ...(await hit.json()), cached: true });

  const { payload, error } = await askStoreSearch(
    env,
    "place_details",
    { place_id: placeId, photos: 6, reviews: true },
    request
  );
  if (error) return refuse(error);
  const found = placeDetail(payload);
  if (!found) {
    return json({ error: "not_found", message: "That place could not be loaded." }, { status: 404 });
  }
  const answer = { place: found, cached: false };
  ctx.waitUntil(
    cache.put(
      key,
      new Response(JSON.stringify(answer), {
        headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${FEED_TTL}` },
      })
    )
  );
  return json(answer);
}

/**
 * One end of a flight, from whatever the page could give us.
 *
 * Three letters is an IATA code. Anything longer is a name a traveller typed
 * or picked, and the coordinates that came with the suggestion are what decide
 * — Duffel resolves the nearest airport itself. Neither means we were not told.
 */
function endOf(params, nameKey, latKey, lonKey) {
  const named = one(params, nameKey);
  const lat = Number(one(params, latKey));
  const lon = Number(one(params, lonKey));
  const point =
    !!one(params, latKey) && !!one(params, lonKey) && Number.isFinite(lat) && Number.isFinite(lon);
  return { named, code: /^[A-Za-z]{3}$/.test(named) ? named.toUpperCase() : null, lat, lon, point };
}

// ISO dates compare correctly as strings, which is the only reason this is
// safe without parsing. Anything not in that shape is not compared at all —
// upstream can refuse it with better context than we could invent.
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Duffel accepts TEN legs and refuses eleven — measured, not assumed. We refuse
// the eleventh here too, in milliseconds, rather than spending a request to be
// told the same thing.
const MAX_FLIGHT_LEGS = 10;

/**
 * A multi-city journey from `?slices=<url-encoded JSON>`.
 *
 * Returns {slices} or {error}. NOTHING IS INHERITED BETWEEN LEGS: a leg says
 * where it flies FROM even when that is not where the last leg landed, because
 * Barcelona to Rome, then Florence to Paris with a train in between, is a real
 * journey and inferring the origin would make it unsearchable.
 */
function legsOf(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "A journey could not be read." };
  }
  if (!Array.isArray(parsed) || !parsed.length) return { error: "A journey needs at least one leg." };
  if (parsed.length > MAX_FLIGHT_LEGS) {
    return { error: `A journey can have at most ${MAX_FLIGHT_LEGS} legs.` };
  }
  const slices = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const leg = parsed[i] || {};
    const at = i + 1;
    if (!leg.date) return { error: `Leg ${at} needs a date.` };
    const from = endOfValues(leg.from, leg.from_lat, leg.from_lon);
    const to = endOfValues(leg.to, leg.to_lat, leg.to_lon);
    if (!from.code && !from.point) return { error: `Leg ${at} needs somewhere to fly from.` };
    if (!to.code && !to.point) return { error: `Leg ${at} needs somewhere to fly to.` };
    slices.push({
      date: String(leg.date),
      ...(from.code ? { from: from.code } : {}),
      ...(from.point ? { from_lat: from.lat, from_lon: from.lon } : {}),
      ...(to.code ? { to: to.code } : {}),
      ...(to.point ? { to_lat: to.lat, to_lon: to.lon } : {}),
    });
  }
  return { slices };
}

function endOfValues(named, lat, lon) {
  const name = String(named ?? "").trim();
  const la = Number(lat);
  const lo = Number(lon);
  const point = lat != null && lon != null && Number.isFinite(la) && Number.isFinite(lo);
  return { code: /^[A-Za-z]{3}$/.test(name) ? name.toUpperCase() : null, lat: la, lon: lo, point };
}

/** Destination autocomplete. Worldwide, not a Barcelona list. */
async function suggest(env, request, params, ctx) {
  const text = one(params, "q", "", 80);
  if (text.length < SUGGEST_MIN_CHARS) {
    // Not an error: it is simply too early to ask. Answering empty keeps the
    // field quiet rather than flashing "no results" after one letter.
    return json({ suggestions: [], query: text });
  }
  const cache = caches.default;
  const key = new Request(
    `https://suggest.tourguid.invalid/${encodeURIComponent(text.toLowerCase())}`
  );
  const hit = await cache.match(key);
  if (hit) return json({ ...(await hit.json()), cached: true });

  const { payload, error } = await askStoreSearch(env, "city_autocomplete", { text, limit: 8 }, request);
  if (error) return refuse(error);
  const suggestions = suggestionsOf(payload);
  const answer = { suggestions, query: text, cached: false };
  if (suggestions.length) {
    ctx.waitUntil(
      cache.put(
        key,
        new Response(JSON.stringify(answer), {
          headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${SUGGEST_TTL}` },
        })
      )
    );
  }
  return json(answer);
}

async function hotels(env, request, params) {
  const checkIn = one(params, "checkIn");
  const checkOut = one(params, "checkOut");

  // A PICKER IS A CONVENIENCE; THE CHECK HAS TO EXIST BEHIND IT. A page can be
  // reached with typed query parameters, an old bookmark or a stale link.
  //
  // A stay is at least one NIGHT, so check-out is the day AFTER check-in —
  // which is not the same rule as a return flight, where the same day is a
  // real day trip and is allowed deliberately.
  if ((checkIn && !checkOut) || (checkOut && !checkIn)) {
    return json(
      { error: "bad_dates", message: "A stay needs both a check-in and a check-out date." },
      { status: 400 }
    );
  }
  if (isDate(checkIn) && isDate(checkOut) && checkOut <= checkIn) {
    return json(
      { error: "bad_dates", message: "Check-out must be at least one night after check-in." },
      { status: 400 }
    );
  }
  const { payload, error } = await askStoreSearch(
    env,
    "duffel_stay_search",
    {
      place: one(params, "destination"),
      check_in: checkIn,
      check_out: checkOut,
      adults: Number(one(params, "adults", "2")) || 2,
      limit: 12,
    },
    request
  );
  if (error) return refuse(error);
  return json({ stays: hotelResults(payload), captchaChecked: payload.captchaChecked ?? null });
}

async function activities(env, request, params) {
  const where = contextOf(params);
  if (!where.city) return noDestination();
  const { payload, error } = await askStoreSearch(
    env,
    "viator_search",
    { ...where, count: 12, nearbyMiles: 30, nearbyCount: 6 },
    request
  );
  if (error) return refuse(error);
  return json({
    items: activityResults(payload),
    // WHICH Viator destination actually answered. Viator resolves a small town
    // to whatever it does have — Tangalan, Philippines came back as tours
    // hundreds of miles away — so a page presenting these as local is honestly
    // wrong. Pass it on and let the page say where they really are.
    destination: payload.destination ?? null,
    captchaChecked: payload.captchaChecked ?? null,
  });
}

async function places(env, request, params) {
  const where = contextOf(params);
  if (!where.city) return noDestination();
  const { payload, error } = await askStoreSearch(
    env,
    "google_places_search",
    { ...where, category: one(params, "category", "attraction"), pageSize: 12, ...GOOGLE_CARD },
    request
  );
  if (error) return refuse(error);
  return json({ items: placeResults(payload), captchaChecked: payload.captchaChecked ?? null });
}

/**
 * Every homepage carousel in ONE call, cached.
 *
 * The carousels are the same four lists for every visitor and carry no price
 * that anyone can act on and no availability — so they are cached, and the
 * flight and hotel SEARCHES are not. One hour, deliberately short: Google's
 * Places terms limit how long its content may be held, and a Places photo URL
 * expires by itself within hours, so a longer cache would serve broken images.
 *
 * A carousel that cannot be filled comes back empty WITH a reason, so the page
 * keeps its editorial theme cards for that row. An empty list is never dressed
 * up as a result.
 */
async function feed(env, request, params, ctx) {
  const where = contextOf(params);
  const destination = where.city;
  // NO SILENT DEFAULT. A layer that quietly answers "Barcelona" when asked for
  // nowhere is how a Barcelona carousel ends up under someone else's city —
  // the owner's complaint on 2026-09-23.
  if (!destination) return noDestination();
  const asked = one(params, "categories", "")
    .split(",")
    .filter((name) => FEED_PLAN[name]);
  const wanted = asked.length ? asked : Object.keys(FEED_PLAN);

  const cache = caches.default;
  const key = new Request(
    `https://feed.tourguid.invalid/${encodeURIComponent(
      [destination, where.region, where.country].filter(Boolean).join("|").toLowerCase()
    )}/${wanted.join(",")}`,
    { method: "GET" }
  );

  // STALE WHILE REVALIDATE. Stored with a long max-age and its own `fetchedAt`,
  // so a cached answer is always RETRIEVABLE and this code decides whether it
  // is fresh. An hour old still goes out immediately and is refreshed behind
  // the response.
  //
  // Why it matters: the page aborts the feed at 4000ms, and a cold build asks
  // four providers that each take 1.3-3.1s. With a plain TTL the FIRST visitor
  // of every hour pays that, times out, and sees editorial placeholders — so
  // the Store would look unwired to a steady trickle of people forever. Only
  // the very first visitor for a destination now pays a cold build at all.
  const hit = await cache.match(key);
  if (hit) {
    const body = await hit.json();
    const age = Date.now() - (body.fetchedAt || 0);
    if (age > FEED_TTL * 1000) {
      ctx.waitUntil(buildFeed(env, request, where, destination, wanted, cache, key));
    }
    return json({ ...body, cached: true, stale: age > FEED_TTL * 1000 });
  }

  return json(await buildFeed(env, request, where, destination, wanted, cache, key));
}

/**
 * Ask every carousel's providers and store the result.
 *
 * THE CATEGORIES RUN IN PARALLEL. They used to run one after another, which on
 * a cold build meant the sum of four upstream calls — comfortably past the
 * page's 4000ms abort. Each category still tries its OWN providers in order,
 * because that order is a preference (Duffel's priced rooms before Google's
 * unpriced listings), not something to race.
 */
async function buildFeed(env, request, where, destination, wanted, cache, key) {
  const built = await Promise.all(
    wanted.map(async (name) => {
      let group = { live: false, reason: "not_connected", items: [] };
      const plan = FEED_PLAN[name];
      for (const [provider, extra, source, priced] of plan) {
        // Skip a provider known to be switched off — unless it is the only one
        // this row has, in which case ask anyway so the reason stays truthful.
        const until = REFUSED.get(provider) || 0;
        if (Date.now() < until && plan.length > 1) {
          group.reason = "provider_refused";
          continue;
        }
        const { payload, error } = await askStoreSearch(
          env,
          provider,
          { ...where, place: destination, limit: 12, ...extra },
          request
        );
        if (error) {
          // ONLY the provider's own refusal is remembered. `switched_off` is an
          // operator's switch in Control and gets NO memory at all: remembering
          // it would make a re-enabled source look broken for as long as we
          // held it.
          if (error === "provider_refused") REFUSED.set(provider, Date.now() + REFUSED_MS);
          group.reason = error;
          continue;
        }
        REFUSED.delete(provider);
        let rows;
        if (provider === "viator_search") rows = activityResults(payload);
        else if (provider === "duffel_stay_search") rows = hotelResults(payload);
        else rows = placeResults(payload);
        if (!rows.length) {
          group.reason = "no_results";
          continue;
        }
        group = {
          live: true,
          reason: null,
          source,
          items: rows.slice(0, 12).map((row) => asCard(row, name, source, priced)),
        };
        break;
      }
      return [name, group];
    })
  );

  const categories = Object.fromEntries(built);
  const answer = { destination, categories, cached: false, fetchedAt: Date.now() };
  if (Object.values(categories).some((group) => group.live)) {
    // A long max-age keeps it RETRIEVABLE; `fetchedAt` is what decides fresh.
    await cache.put(
      key,
      new Response(JSON.stringify(answer), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" },
      })
    );
  }
  return answer;
}

/**
 * Record an outbound click, then send the traveller to the supplier.
 *
 * Two allow-lists, not one: store-search validates the host as well and its
 * list is the authority, but a second list here means a redirect can never be
 * issued from this Worker against a URL nothing has checked — including after
 * a bad edit to this file.
 *
 * THE REDIRECT IS BEST-EFFORT LOGGED, NEVER BEST-EFFORT SAFE. A refusal from
 * store-search stops the redirect: it knows something we do not. A
 * store-search that cannot be REACHED does not stop it — the URL has already
 * passed our own list, and losing a traveller's booking to protect a log row
 * is the wrong way round. The affiliate ids are in the supplier's own URL
 * either way, so the click still pays even when the row is missing.
 */
async function go(env, request, params) {
  const target = params.get("url") || "";
  const supplier = supplierOf(target);
  if (!supplier) {
    return json(
      { error: "not_a_supplier", message: "That link is not one we hand off to." },
      { status: 400 }
    );
  }
  const url = (env.STORE_SEARCH_URL || "").trim();
  const secret = (env.STORE_CALLER_SECRET || "").trim();
  const provider = LEDGER_PROVIDERS[supplier];
  let destination = target;
  let recorded = false;

  if (url && secret && provider) {
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/referral`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-store-caller": secret },
        body: JSON.stringify({
          provider,
          productId: one(params, "productId") || null,
          url: target,
          // A PATH, never a full URL and never a query string: a visitor's own
          // search terms must not reach the ledger.
          page: safePath(one(params, "page", "/", 300)),
        }),
      });
      if (response.status === 400) {
        return json(
          { error: "not_a_supplier", message: "That link is not one we hand off to." },
          { status: 400 }
        );
      }
      if (response.ok) {
        const answer = await response.json();
        if (answer && typeof answer.url === "string" && supplierOf(answer.url)) {
          destination = answer.url;
        }
        recorded = true;
      }
    } catch {
      /* unreachable: redirect anyway, unrecorded */
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      // Our own URL names the supplier and the product. Do not let it travel
      // on to the supplier as a referrer.
      "Referrer-Policy": "no-referrer",
      // A cached 302 to a product link, replayed for someone else, would
      // mis-attribute a click.
      "Cache-Control": "no-store",
      "X-TourGuid-Referral": recorded ? "recorded" : "not-recorded",
    },
  });
}

function safePath(value) {
  try {
    return new URL(value, "https://tourguid.net").pathname || "/";
  } catch {
    return "/";
  }
}

async function heroPhoto(env, params, ctx) {
  const destination = one(params, "destination", "", 100);
  const wanted = Math.min(Math.max(Number(one(params, "count", "6")) || 6, 1), 12);

  // A named destination gets pictures OF that place. With none, the hero is
  // generic travel rather than a city nobody asked for — which is why the
  // curated Barcelona fallback was removed and this replaces it.
  const day = Math.floor(Date.now() / 86400000);
  const query = destination
    ? `${destination} city skyline travel`
    : HERO_QUERIES[day % HERO_QUERIES.length];

  const cache = caches.default;
  const key = new Request(
    `https://hero.tourguid.invalid/${encodeURIComponent(query.toLowerCase())}/${wanted}`
  );
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), { cache: HERO_TTL });

  const apiKey = (env.PEXELS_API_KEY || "").trim();
  if (!apiKey) return json({ photos: [], image: null, source: "no_key" }, { cache: HERO_TTL });

  let photos = [];
  try {
    const search = new URLSearchParams({
      query,
      orientation: "landscape",
      per_page: String(Math.max(wanted * 2, 8)),
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${search}`, {
      headers: { Authorization: apiKey },
    });
    if (response.ok) {
      photos = (((await response.json()) || {}).photos || [])
        .filter((photo) => photo && photo.src && photo.src.large2x && photo.url)
        .slice(0, wanted)
        .map((photo) => ({
          image: photo.src.large2x,
          // Pexels asks that the photographer be credited wherever the
          // photograph is shown. Carried per photograph so a slideshow can
          // change the credit with the picture.
          photographer: photo.photographer || "a Pexels photographer",
          photographerUrl: photo.photographer_url || null,
          page: photo.url,
        }));
    }
  } catch {
    /* fall through to an empty set — never a substitute picture */
  }

  const data = {
    photos,
    // The first, for anything still reading a single hero.
    image: photos.length ? photos[0].image : null,
    photographer: photos.length ? photos[0].photographer : null,
    page: photos.length ? photos[0].page : null,
    source: photos.length ? "pexels_api" : "no_photo",
    generic: !destination,
  };
  if (photos.length) {
    ctx.waitUntil(
      cache.put(
        key,
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${HERO_TTL}` },
        })
      )
    );
  }
  return json(data, { cache: HERO_TTL });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Everything that is not ours goes to the static site, unchanged.
    if (!path.startsWith("/api/store/")) return env.ASSETS.fetch(request);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, { status: 405 });
    }
    const params = url.searchParams;

    switch (path) {
      case "/api/store/health":
        return json({
          storeSearch:
            (env.STORE_SEARCH_URL || "").trim() && (env.STORE_CALLER_SECRET || "").trim()
              ? "configured"
              : "not_configured",
          heroPhoto: (env.PEXELS_API_KEY || "").trim() ? "pexels" : "fallback_only",
          routes: ["suggest", "flights", "hotels", "activities", "places", "feed", "detail", "go", "hero-photo"],
        });
      case "/api/store/flights":
        return flights(env, request, params);
      case "/api/store/hotels":
        return hotels(env, request, params);
      case "/api/store/activities":
        return activities(env, request, params);
      case "/api/store/places":
        return places(env, request, params);
      case "/api/store/feed":
        return feed(env, request, params, ctx);
      case "/api/store/go":
        return go(env, request, params);
      case "/api/store/suggest":
        return suggest(env, request, params, ctx);
      case "/api/store/detail":
        return detail(env, request, params, ctx);
      case "/api/store/hero-photo":
        return heroPhoto(env, params, ctx);
      default:
        return json({ error: "not_found" }, { status: 404 });
    }
  },
};
