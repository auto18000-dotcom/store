# Handover to the mobile sessions: web work since builds 81 / 58 (4 October 2026)

To: TG-Mobile-1A (the app, and the only session that builds) with TG-Mobile-1 copied (schema, functions, tiers).
From: TG-Web-1. The owner said, in TG-Web-1's chat: "Review and handover Mobile1 all your work since the last android and
ios builds to be added to their next builds." This file is not shipped (wrangler ships only `./public`; this lives in
`TourGuid-Web/specs/`). Companion file for the web sessions: `handover-to-tg-web-1a-2026-10-04.md`.

## 0. Baseline and the honest bottom line

- Last builds: **Android versionCode 81, iOS buildNumber 58, version 1.6.0**, build commit `5be342c8`, started
  2026-09-19 11:07 PDT (mobile commit `60341ac`). `RELEASE-STATE.md` records no newer build.
- I made **no change to the mobile repo and to nothing an app build bundles**. Every commit of mine since then is in
  `TourGuid-Web` (tourguid.net), `TourGuid-Z1` (z1.tourguid.net) or `TourGuid-App` (app.tourguid.net). So no code of mine can be
  "added to a build". What the next builds DO need from my work is four things, in this order of importance:
  1. **A hosting fact that changes how you edit links** (section 1). It is the one that can silently break a release.
  2. **Contracts the app must mirror word for word** (section 2).
  3. **Decisions that shape the next build** (section 3).
  4. A list of what you can ignore (section 4), and the inventory behind all of it (section 5).

## 1. app.tourguid.net is no longer served from your `docs/` (read this before the next build)

Since the owner's go on 2026-09-30 (~15:38Z) a Cloudflare Worker, `tourguid-app` (repo `C:\Claude\TourGuid-App`), answers
`app.tourguid.net/*` as a Workers Route in front of GitHub Pages. It serves its OWN copies, in `TourGuid-App/public/`, of: both
link files (`.well-known/apple-app-site-association`, `.well-known/assetlinks.json`), the sixteen token-bearing auth paths
(`/`, `/index.html`, `/dev/`, `/staging/`, `/reset-password`, `/email-confirmed`, each also with `.html`, each for `/dev` and
`/staging`), `privacy`, `terms`, `accessibility`, `marketing`, `delete-account.html`, and the web Trip planner at `/trip/`.
The copies were extracted byte for byte from `origin/master` (with `git show`, never the working tree, whose CRLF copies are
inflated). Checked today: all ten link, auth and legal files are byte-identical to `origin/master` `6d173c9` (30 Sep).

What that means for you:

1. **Editing `docs/` in the mobile repo and pushing to master no longer changes what the world sees** for any path above.
   The change only goes live when it is also copied into `TourGuid-App/public/` and that Worker is redeployed (the owner's word,
   given in the deploying session's own chat). Until then the live file is the old copy.
2. **A path the Worker does not have answers an empty `404`, not GitHub Pages' page.** Verified today:
   `/handoff-return`, `/dev/handoff-return`, `/t/abc123` and `/nonexistent-xyz` all return 404. If the next build claims a new
   link path (the Revised Plan's `/handoff-return`, which needs "three tier paths, not one", or a share link such as `/t/<token>`),
   the page for people WITHOUT the app must exist on the Worker, and the iOS file must list the path.
3. **The iOS file** (`apple-app-site-association`) today claims exactly: production `Z7W6P824SV.com.tourguid.app` ->
   `/reset-password`, `/email-confirmed`; dev `...app.dev` -> `/dev/reset-password`, `/dev/email-confirmed`; staging `...app.staging`
   -> `/staging/...` the same two. It is served `Content-Type: application/octet-stream` with no redirect; keep both. Changing
   a content type or adding a redirect there is the kind of silent break that makes links open in the browser.
   **Android** `assetlinks.json` lists only `com.tourguid.app` (three fingerprints), so the Dev and Staging Android variants are
   not verified today (RELEASE-STATE says the same). The paths Android claims come from each build's intent filters.
4. **Builds 81/58 read a token with `Linking.parse(url).queryParams` (the query string only).** The website therefore cannot
   move tokens into the URL fragment (TGSEC-001 brief item 4) until a build reads the fragment too. Doing that in the next
   build unblocks it.
5. The Worker's own source says: do NOT add web pages at `/reset-password`, `/email-confirmed`, `/dev/*`, `/staging/*` beyond what
   exists, because the shipped app owns those paths and a web page would open instead of the app. New web auth callbacks go at
   `/account/...` (Phase 1, not built).
6. Apple fetches the iOS file when an app is installed or updated and caches it, and a change can take time to reach every
   phone (general knowledge, not checked here). So put new paths live BEFORE the build reaches users.

**How to change a link or auth file after the cutover** (the web session does the Worker half; it needs the owner's word to deploy):
1. Decide the paths per tier (`appLinkPaths(tier)` in `src/lib/tierLinks.ts` is the source of truth).
2. In the mobile repo, change the file under `docs/` as before and get it to `origin/master` (the owner's push). Keep origin right:
   if the Worker ever throws on a covered path it falls back to origin (`orFallToOrigin`).
3. In `TourGuid-App`: copy each file with `git -C C:\Claude\ItinearyBosd-mobile show origin/master:docs/<path> > public/<path>`
   (not from the working tree); add any NEW page under `public/`; if it can ever carry a token add the path (both forms) to
   `AUTH_PAGES` in `src/index.js` AND to `run_worker_first` in `wrangler.jsonc`; add the file to `scripts/verify-preserved-paths.mjs`
   with its sha256; run `npm test`, then `npx wrangler@4.142.0 dev` and `node scripts/verify-preserved-paths.mjs http://localhost:8787`.
4. Deploy (`npx wrangler@4.142.0 deploy` from a clean worktree of TourGuid-App) on the owner's word, then check live: the hash of each
   file equals the repo copy, the iOS file's content type, 200 with no redirect on both forms, and one new path answers.
5. Rollback of the whole hosting move: remove the `routes` block in `wrangler.jsonc` and redeploy; traffic falls back to GitHub
   Pages through the DNS record that was never touched. Note that changes made only in the Worker's copies are then lost.

## 2. Contracts the app must mirror (claims word for word; glyphs and layout may differ)

The web sheet is live behind flags that are OFF; the strings below were agreed with TG-Mobile-1A on 3 Oct and are what the web
builds (`public/store/journey-ui.js`). The app drops the arrow glyph on the Continue button (it opens an in-app browser) and keeps
the heading.
- **Unverified provider, sheet on:** kicker "You are leaving TourGuid"; heading "Continue to {Provider}"; the item's own title
  (omitted when the link is only a provider's home page); "{Provider}'s own terms apply."; "You will go to {host}."; buttons
  "Continue to {Provider}" and "Cancel". No payment-party claim, no "Verified" badge, no amber warning.
- **Refused** (registry says handoff off, or `plan.require_verified_provider` on and not verified): kicker "Not available yet";
  heading "{Provider} is not available from TourGuid yet"; with the flag: "TourGuid has not verified this provider yet. You can keep
  planning your Journey in the meantime."; with handoff off: only "You can keep planning your Journey in the meantime."; one button
  "Close". No Continue.
- **Verified** (labelled rows, not sentences, in this order, each only if present): Payment party (`payment_party_label`, verbatim);
  Funds received by (`funds_recipient`, ONLY when it differs from the payment party, compared trimmed, whitespace collapsed,
  case-insensitive); Terms (the address without `https://`, never shortened, then " (version X)"); Cancellation & refunds;
  Support phone (`tel:` link, digits and + only in the href, the number shown verbatim); Support email (`mailto:`, plain
  local@domain only); Support page; Support address (plain text, last).
- **Provider name from a host** (until the registry's `display_name` answers): drop one leading "www."; a host equal to or a
  subdomain of viator.com, getyourguide.com, opentable.com, expedia.com, duffel.com or tiqets.com gets "Viator", "GetYourGuide",
  "OpenTable", "Expedia", "Duffel", "Tiqets"; `maps.google.com`, or `google.com` with a path starting `/maps`, gets "Google Maps";
  anything else is the bare host. No public-suffix logic. Lookalikes (`evilviator.com`, `viator.com.evil.example`) match nothing.
  The web source is `public/store/supplier-link.js` `name()`; the table of examples is in `test/supplier-link.test.mjs`.
- **Registry gates to honour:** `handoff_enabled` false means no handoff; `may_display_price` governs Bookings Needed only, never
  Store prices; a row that says verified without payment party, terms and cancellation is not verified (the web Worker enforces
  this in `providerRow`).
- **Never** send `tiqets` or a new field to the store-search `/referral` endpoint until TG-Mobile-1 confirms the tier accepts it.

## 3. Decisions and dependencies that shape the next builds

1. **Fares in the app.** The website has shown Duffel totals since 21 Sep; on 3 Oct it gained "Baggage fees may apply. Check the
   airline's own website for its baggage fees before you book." on the results and the fare page (live, commit `fbdd736`; counsel
   should confirm the wording, whether 399.84 wants a per-passenger breakdown, and whether 399.85 also wants a link per airline).
   The app reads fares and never shows them (owner, 15 Sep). If a build starts showing fares, it needs the full price (14 CFR 399.84)
   and this notice on the first fare screen. The Morning Package decision "prices in the app" is still the owner's.
2. **In-app browser.** TG-Mobile-1A found `expo-web-browser` is not a dependency, so providers open with `Linking.openURL` and the
   claim "closing it returns to the same screen" is not yet true on the phone. Adding it needs a native rebuild nobody has authorised.
3. **Return deep link and share links** need per-tier paths, the iOS file, and Worker pages (section 1). Share pages are web-rendered
   behind TG-Mobile-1's visibility model (migration 396); do not build either side before that exists.
4. **Itinerary times are the destination's** (owner, 4 Oct: plan Paris from any zone and every time is Paris's). The web now reads
   it that way (TourGuid-Z1 `5c04c17`, `450b2cf`, from the app's `flightTiming.ts` `ac80813`). The Oct 2 brief never states the rule;
   make the app and the brief agree.
5. **The owner ruled the shared web/phone iconography proposal is NOT for the app** (26 Sep). Do not take it on.
6. Plan B (the web Trip planner, `app.tourguid.net/trip/` and z1) consumes the app's rules as a drift-checked COPY
   (`TourGuid-Z1/scripts/vendor-rules.mjs`); web never edits them, so there are no web-side rule fixes waiting to be ported.
   Web-original logic that mirrors an app rule: `web/src/shared/dateSeries.ts` ("dates recalculate the whole chain"). I did not
   check whether the app already behaves identically.

### 3b. The owner's goals of 4 October against what TG-Web-1 wrote down

TG-Mobile-1A relayed the owner's list (sharpen trip building; payment handover and what TourGuid accepts, under California AG
rules; Plus accounts and entitlements with testers on Plus by default; Plus at $29.99 a year from the next builds with AdMob on the
regular build; vendor APIs so TourGuid is never merchant of record; web sign-in; web itinerary and trip building synced with mobile;
all by the weekend of 10-11 Oct) and asked whether it contradicts anything TG-Web-1 decided. Eight places:
1. **Price.** $29.99 a year replaces "$36 vs $39" (Revised Plan G05) and the Morning Package's $39. The owner earlier ordered every
   dollar price removed from tourguid.net (27 Sep). Nothing on the site shows a price today; ask whether the web should now show
   $29.99, and note California's auto-renewal rules (Bus. & Prof. Code 17602, from the Morning Package review) bind every rail.
2. **"TourGuid is not a merchant of record and accepts no payment."** True for travel only if every provider hands off to its own
   checkout, and for Duffel Links nobody has said who the merchant is (Duffel's written answer is outstanding). It cannot be true of
   Plus: Apple and Google are the merchant for in-app purchases, but on the web the Morning Package plan (Stripe) makes TourGuid the
   seller. If even Plus must not make TourGuid the merchant on the web, the web checkout needs a merchant-of-record provider, or Plus
   is sold only in the apps. The owner should rule on this before anyone builds web checkout.
3. **A general sentence on the sheet.** The agreed rule is that wording is a claim: the unverified sheet names only where the traveller
   goes and whose terms apply; payment party and funds recipient come only from a verified profile. A universal "TourGuid does not accept
   payment" would be a claim no evidence yet supports for Duffel, Tiqets or the hotel provider.
4. **Web sign-in.** The Morning Package item and the Revised Plan hold said "hold until email-code sign-in exists in the app,
   Production only". The owner now wants it by the weekend. The hold stays accurate until that flow exists (TG-Mobile-1); new web auth
   callbacks must go at `/account/...`, never on the claimed `/reset-password` and `/email-confirmed` paths (section 1.5).
5. **The Revised Plan's "Held" items** (web Bookings Needed, web Plus page, trip state across the tab) were held only because the site
   had no sign-in or trips. The new goal removes that reason once accounts exist; the rule "nothing is built that fakes either" stays.
6. **Testers on Plus by default** contradicts nothing in the web notes, but the build split's decision ("a dated grant for existing
   accounts, gates ship off") is superseded for testers; the web flags are unaffected.
7. **AdMob** is mobile only. The website has no ad code and its CSP admits no ad hosts; ads on the web would be a separate decision.
8. **"Web itinerary completely built by next weekend"** conflicts with the dependencies still open: migrations 391-396 are applied
   nowhere, sign-in does not exist on the web, the Tiqets and Duffel gates are closed, and the verified payment facts need the owner
   and counsel. Each is a person's decision or access, not code.

## 4. Not for builds (so nobody hunts for it)

Store pages and carousels, the homepage and its preview, SEO and the sitemap, analytics (Cloudflare Web Analytics, the Analytics
Engine dataset), the `/api/store/*` Worker routes and their flags, `/api/store/go` and the web referral ledger
(`store_referrals`, web only), the z1 cockpit and Plan B visuals, the Search Console export. None of it ships inside an app.

## 5. Inventory of my commits since 2026-09-19 11:07 PDT

List any of them with `git log --since="2026-09-19 11:07:00 -0700" --reverse --format="%h %ad %s" --date=format:"%m-%d %H:%M"` in
each repo. Counts at 4 Oct: TourGuid-App 6, TourGuid-Web about 105 (plus handoff and flag commits by TG-Mobile-1A and TG-Web-1A),
TourGuid-Z1 about 75 (about a third are TG-Web-1A's Plan B restyle). Grouped:

| Theme | Where, commits | In an app build? | What mobile does |
| --- | --- | --- | --- |
| app.tourguid.net hosting, auth hardening, `/trip/` | TourGuid-App `e1fa226`..`5c06a0b` (6), live since 30 Sep | no, but builds depend on it | section 1 |
| Store on tourguid.net (shell, flights, hotels via LiteAPI display only, gallery, autocomplete, carousels) | TourGuid-Web `e9782b9`..`bcc4f42` (Sep 21-26) | no | none |
| Homepage live, nav trimmed, no prices | TourGuid-Web `e438667`, `a5b9a42`, `221ecc7` (Sep 27-30) | no | none |
| Phase 0: sitemap, robots, metadata, supplier clicks through `/api/store/go`, no "$9.99" | TourGuid-Web `cc95e7d` (1 Oct) | no | none |
| Handoff sheet, registry route, flags, 44px targets, "Support address" | TourGuid-Web `99aa841`, `729475c`, `b4ace72`, `c0e14de`, `d8d9847`, `efcf5d6` | no | mirror section 2 |
| Baggage-fee notice | TourGuid-Web `fbdd736` (live) | no | section 3.1 |
| Images and fonts marked binary in git | TourGuid-Web `b31572c` | no | none |
| Analytics Engine, owner's flag switch | TourGuid-Web `5ff7518`, `1e0da90`, `bdaaae3` (TG-Mobile-1A) | no | none |
| z1 locked workshop, cockpit wireframe, Trip flow, Plan B, `/social`, homepage preview | TourGuid-Z1 `32ffcd7`..`899edc4` (Sep 20-27) | no (`/social` is YOUR export hosted on z1) | none |
| Plan B restyle pass 2, time zones, destination clock | TourGuid-Z1 `b0bb9f4`..`450b2cf` (TG-Web-1A) | no | section 3.4 |

Three of my z1 homepage-preview commits (`156c32f`, `306a1a2`, `899edc4`) are still undeployed on z1; they are web only.

## 6. Who to ask

TG-Web-1 answers questions about all of the above and nothing else. Web work still open is split in the other handover file
(TG-Mobile-1A holds most of it, TG-Web-1A the Search Console export, Plan B/z1, Explore and the section 7 exports).
