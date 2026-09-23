/**
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
const SUGGEST_MIN_CHARS = 2;

const BARCELONA_FALLBACK = {
  image:
    "https://images.pexels.com/photos/1388030/pexels-photo-1388030.jpeg?auto=compress&cs=tinysrgb&w=2000",
  photographer: "Aleksandar Pasaric",
  page: "https://www.pexels.com/photo/aerial-photography-of-city-1388030/",
  source: "curated_fallback",
};

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
const STATUS = { busy: 429, daily_cap: 429, unavailable: 502, unknown_search: 404 };

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
  if (response.status === 401) return { error: "not_allowed" };
  if (response.status === 404) return { error: "unknown_search" };
  if (response.status === 429) return { error: reason === "daily_cap" ? "daily_cap" : "busy" };
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
  const origin = one(params, "origin").toUpperCase();
  const destination = (one(params, "destination") || "BCN").toUpperCase();
  const departure = one(params, "departure");
  const passengers = Number(one(params, "passengers", "1")) || 1;
  if (!origin || !departure) {
    return json(
      { error: "bad_request", message: "A departure airport and date are required." },
      { status: 400 }
    );
  }
  const { payload, error } = await askStoreSearch(
    env,
    "duffel_flight_offers",
    { from: origin, to: destination, date: departure, adults: passengers, limit: 12 },
    request
  );
  if (error) return refuse(error);
  return json({
    offers: flightOffers(payload, origin, destination, departure),
    // Duffel says which mode answered. A test key invents an airline called
    // "Duffel Airways" and synthetic fares; a page that cannot tell the
    // difference will quote them to a real traveller. Carry it through so the
    // site can say so plainly — or refuse to show prices at all.
    liveMode: payload.live_mode ?? null,
    // Carried through untouched. False means the search ran WITHOUT a CAPTCHA
    // check; passing it on means nobody can mistake one for the other.
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
  const { payload, error } = await askStoreSearch(
    env,
    "duffel_stay_search",
    {
      place: one(params, "destination"),
      check_in: one(params, "checkIn"),
      check_out: one(params, "checkOut"),
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
  const hit = await cache.match(key);
  if (hit) {
    const body = await hit.json();
    return json({ ...body, cached: true });
  }

  const categories = {};
  for (const name of wanted) {
    categories[name] = { live: false, reason: "not_connected", items: [] };
    for (const [provider, extra, source, priced] of FEED_PLAN[name]) {
      const { payload, error } = await askStoreSearch(
        env,
        provider,
        { ...where, place: destination, limit: 12, ...extra },
        request
      );
      if (error) {
        categories[name].reason = error;
        continue;
      }
      let rows;
      if (provider === "viator_search") rows = activityResults(payload);
      else if (provider === "duffel_stay_search") rows = hotelResults(payload);
      else rows = placeResults(payload);
      if (!rows.length) {
        categories[name].reason = "no_results";
        continue;
      }
      categories[name] = {
        live: true,
        reason: null,
        source,
        items: rows.slice(0, 12).map((row) => asCard(row, name, source, priced)),
      };
      break;
    }
  }

  const answer = { destination, categories, cached: false };
  if (Object.values(categories).some((group) => group.live)) {
    const stored = new Response(JSON.stringify(answer), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${FEED_TTL}` },
    });
    ctx.waitUntil(cache.put(key, stored));
  }
  return json(answer);
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
  const destination = one(params, "destination", "Barcelona", 100) || "Barcelona";
  const cache = caches.default;
  const key = new Request(
    `https://hero.tourguid.invalid/${encodeURIComponent(destination.toLowerCase())}`
  );
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), { cache: HERO_TTL });

  const apiKey = (env.PEXELS_API_KEY || "").trim();
  if (apiKey) {
    try {
      const query = new URLSearchParams({
        query: `${destination} city skyline travel`,
        orientation: "landscape",
        per_page: "8",
      });
      const response = await fetch(`https://api.pexels.com/v1/search?${query}`, {
        headers: { Authorization: apiKey },
      });
      if (response.ok) {
        const photos = ((await response.json()) || {}).photos || [];
        const photo = photos.find((item) => item && item.src && item.src.large2x && item.url);
        if (photo) {
          const data = {
            image: photo.src.large2x,
            photographer: photo.photographer || "a Pexels photographer",
            page: photo.url,
            source: "pexels_api",
          };
          ctx.waitUntil(
            cache.put(
              key,
              new Response(JSON.stringify(data), {
                headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${HERO_TTL}` },
              })
            )
          );
          return json(data, { cache: HERO_TTL });
        }
      }
    } catch {
      /* fall through to the fallback below */
    }
  }
  const data = destination.toLowerCase().startsWith("barcelona")
    ? BARCELONA_FALLBACK
    : { image: null, source: "no_photo" };
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
