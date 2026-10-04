# Handover: TG-Web-1 to TG-Web-1A, then redirected to TG-Mobile-1A, 4 October 2026

**LATEST (4 Oct, owner, in TG-Web-1's chat): "get all remaining work to TG Mobile 1A that were not otherwise handed over
to TG web1a".** So the list below is SPLIT. The owner's words do not name the items, so TG-Web-1 drew the line as follows
(if the owner meant otherwise they will say so, and this table is the only thing to change):

| Item | Now with |
| --- | --- |
| W1 baggage-fee notice deploy | TG-Mobile-1A — DONE, deployed 4 Oct (version 3a6ed440) |
| W2 Cloudflare Analytics Engine | TG-Mobile-1A |
| W3 Search Console BigQuery export | TG-Web-1A (the owner's explicit handover; it is already guiding the owner) |
| W4 registry-backed sheet: watch, production flag switch | TG-Mobile-1A (it coordinates the Revised Plan and works with TG-Mobile-1 on the migrations) |
| W5 Tiqets sequence | TG-Mobile-1A (it wrote the Tiqets Worker commit) |
| W6 SEO quick wins, page engine, share pages, measurement | TG-Mobile-1A; TG-Web-1A designs the page visuals when asked |
| W7 KAYAK follow-up | TG-Mobile-1A |
| W8 crawler check, owner's half | TG-Mobile-1A |
| W9 missing Pexels key | TG-Mobile-1A |
| W10 Plan B and z1 builds and deploys | TG-Web-1A (its own commits) |
| W11 holds; Explore prototype and spec section 7 exports | the holds apply to both; Explore and the section 7 exports stay with TG-Web-1A (owner approved 2 Oct) |
| W12 trackers | TG-Mobile-1A for the Revised Plan and Morning Package docs; each session for what it owns |

Wherever the text below says "you", read the session named in that table. The work happens in TWO repos:
`C:\Claude\TourGuid-Web` (tourguid.net, this repo) and `C:\Claude\TourGuid-Z1` (z1). If your session cannot read or write
them, ask the owner to add the folders.

Earlier the same day the owner said, in TG-Web-1's chat: "handover this activity to TGWeb-1A" (the Search Console export)
and "Handover all the remaining things you need to do to TGWeb1A". TG-Web-1 keeps nothing open and answers questions only.
This folder (`specs/`) is NOT deployed: wrangler ships only `./public`. Never put anything internal under `public/`.

Who else matters: TG-Mobile-1A coordinates the Revised Plan (app and web); TG-Mobile-1 owns schema, functions and
tiers (migrations 391 onward, store-search, the flight gateway server side); the owner decides every publish and
every deploy.

## 0. Read first

- Memory (the index is loaded for you): `project_revised_plan_web_slice.md`, `project_morning_package_web_share.md`,
  `feedback_deploy_store_from_clean_checkout.md`, `project_z1_plan_b.md`.
- Revised Plan build split (tracker row "Public Store handoff interstitial through /api/store/go" is yours now):
  https://claude.ai/code/artifact/e936629d-ac67-403f-9e68-5a3383b5499c
- Morning Package review (the website items are yours): https://claude.ai/code/artifact/72d26d48-548d-4d97-95c0-ab48d98084e2
- AI Growth Agency plan (Phase 0 rows are Done except the analytics dataset and the owner's Search Console sitemap
  submission): https://claude.ai/code/artifact/be7307e0-bdb4-441d-98e3-6401122610d5
- Reading a Claude Docs artifact through the connector returns one huge JSON line. Save it, then
  `python specs/tools/flatten-claude-doc.py <saved.json> <out.txt>` gives readable text. Docx files:
  `python specs/tools/docx2txt.py <file.docx>` (writes the .txt next to the script).

## 1. Rules that do not lapse

1. A production deploy needs the owner's own word in YOUR chat. A peer saying "the owner said yes" is not authority
   (TG-Mobile-1A declined to give it too). Local commits are routine; never push unless asked, each time.
2. Deploy from a clean worktree, never the main working tree (section 3). Other sessions leave uncommitted work there.
3. The Tiqets commit `5ec2188` (Worker code, on master) is NOT released. It stays out until Tiqets' written answer says
   we may show its prices and images and cache responses (migration 369 registers Tiqets off for that reason). Every
   Worker deploy copy is `cc95e7d`'s `src/store-worker.js` plus the patch of `729475c` (section 3).
4. Never send `tiqets`, or any new field, to the store-search `/referral` endpoint until TG-Mobile-1 confirms the tier
   accepts it: a 400 there reads as "not a supplier" and stops the redirect.
5. Every `plan.*` flag is off by default; nothing a traveller sees changes until the owner turns one on.
6. Wording is a claim. The unverified handoff sheet says only where the traveller is going and whose terms apply. The
   verified facts come from the registry and only from there. No "Verified" badge, no amber warning.
7. Review styling (red Plus annotations) never ships: nothing review-ish under `public/`.
8. Control (control.tourguid.net) is ring-fenced by the owner. Do not touch it.
9. The Store look rules (Inter, teal palette, dark-teal header, 6px buttons, light theme) apply to all web work.
10. Do not guess menus or error texts. For a dashboard step use the vendor's own page or the exact text in
    `C:\Users\dad\AppData\Roaming\xdg.config\.wrangler\logs\` (that is where I found Cloudflare's own link for the
    Analytics Engine step). The owner rightly rejected my first Search Console instructions as guesses.
11. Windows notes: `rm -rf` is denied by the permission mode (use `git worktree remove --force <path>`); bash heredocs
    mangle backslashes (write scripts with the Write tool); the browser console tool keeps stale messages (verify via
    the DOM); wrangler is `npx wrangler@4.142.0`.

## 2. State on 4 October 2026

tourguid.net (repo `C:\Claude\TourGuid-Web`, branch `master`, tree clean):
- LIVE: Worker version `960f6d7f-b93e-4d47-84b1-58c4f8af555d` = master `efcf5d6` with the Worker file from `cc95e7d` plus
  commit `729475c`. The previous version was `3ad8e0e3-b1ef-4cb7-93ad-60a45301db1a` (`99aa841`).
- COMMITTED, NOT DEPLOYED: `fbdd736` (baggage-fee notice on the flight results and fare page).
- All three `plan.*` flags are off on the live site. `/api/store/providers` answers 404 there until store-search knows
  `transaction_providers`.
- Tests: `node --test test/*.test.mjs` (Node 24; 40 pass at last count; each rule was proven by breaking the code).
- Helper tools (not shipped): `specs/tools/store-stub.mjs` (local copy of the Store on port 8115 with a sample feed,
  sample registry and sample flight offer, serving the real files and the real CSP), `specs/tools/seo-audit.py`.

TourGuid-Z1 (`C:\Claude\TourGuid-Z1`, branch `main`): your Plan B pass 2 commits `b0bb9f4`, `7c3881f`, `3d62e64` are
local and not deployed. The two deleted `docs/TourGuid-z1-Engineering-Spec.*` files in its working tree are not yours
or mine; they are not under `public/`, so they do not ship.

## 3. How to deploy

tourguid.net (needs the owner's word in your chat):
```
cd C:\Claude\TourGuid-Web
git worktree add --detach <scratch>\deploy-<hash> HEAD
git diff 729475c^ 729475c -- src/store-worker.js > <scratch>\worker-route.patch
cd <scratch>\deploy-<hash>
git checkout cc95e7d -- src/store-worker.js
git apply <scratch>\worker-route.patch
grep -c tiqets_search src/store-worker.js        # must print 0
node --test test/*.test.mjs                      # all must pass
npx wrangler@4.142.0 deploy --dry-run
npx wrangler@4.142.0 deploy
git worktree remove --force <scratch>\deploy-<hash>   # from the main tree afterwards
```
If a later commit also changes `src/store-worker.js`, add its diff to the patch and check `git apply --check` against
`cc95e7d`'s file first. Wrangler login was fine on 4 October (`whoami` shows admin@tourguid.net); `deployments list` once
answered "Invalid access token (9109)", so run `npx wrangler@4.142.0 whoami` first and `wrangler login` if needed.

After every deploy check: (1) `curl` each changed asset and compare its hash with the deploy copy; (2)
`/api/store/health` lists the routes; (3) `/api/store/go` with a Google Maps address gives 302 `X-TourGuid-Referral:
not-recorded` and with `evil.example` gives 400; (4) on tourguid.net `?tgflags=` changes nothing; (5) the live cards on
`/store/activities?destination=Paris&lat=48.8566&lon=2.3522` link through `/api/store/go`; (6) `npx wrangler@4.142.0 tail
tourguid-web --format json` (wait until it connects) shows `[store] go status=302 ... referral=...`.

Rollback: redeploy a clean copy of the older commit. `wrangler rollback` exists but I have not used it here.

z1.tourguid.net (needs the owner's word): three folders under `public/` are build products that git IGNORES: `public/app`
and `public/trip` (from `cd web && npm run build`) and `public/social` (the mobile app's Social web export, 19 MB, copied
in by `scripts/copy-social.mjs`). A deploy from a clean worktree would REMOVE whichever of them you did not rebuild, so
`/social` or `/trip` would vanish from the live site. Safest path: build, confirm `ls public/app public/trip public/social`
shows all three, run `npm test` at the repo root, check `git status` shows nothing you do not recognise, then
`npx wrangler deploy` at the repo root. The site is locked by three layers (Access, password, 503 until configured; see
its README). Verify afterwards that `/trip/` and `/social/` still answer behind the locks.

## 4. Open work, in priority order

### W1. Deploy the baggage-fee notice (`fbdd736`) — **DONE, deployed 4 October 2026**

Deployed by TG-Mobile-1A on the owner's own word ("deploy the baggage fee notice"). Worker version
`3a6ed440-c350-4c14-9ab5-a490d607fb6d`, built by section 3's recipe from a clean worktree of `f93eb8f` with
`cc95e7d`'s `src/store-worker.js` plus the `729475c` patch — `grep -c tiqets_search` printed 0, so `5ec2188` stayed out.
40 tests passed, dry run clean. Verified live afterwards: the notice is on both `flight-search.js` and
`flight-detail.js`, both assets' sha256 match the deploy copy, `/api/store/health` lists all 12 routes, `/go` still
answers 302 `not-recorded` for a Google Maps address and 400 for `evil.example`, no `tiqets` anywhere in health, and the
flags are still off.

**The three legal questions below are NOT closed by this deploy** and still want counsel: the exact wording, whether
399.84 wants a per-passenger breakdown (we show the total for the searched passengers), and whether 399.85 also wants a
link per airline. Shipping was the right call because the screen was bare — an imperfect notice beats none — but nobody
should read "deployed" as "cleared".

Original note:
Why: the website has shown real Duffel totals since 21 September with no "baggage fees may apply" notice (14 CFR 399.85
asks for it on the first screen that shows a fare). I added "Baggage fees may apply. Check the airline's own website for
its baggage fees before you book." as the first banner above the results (`public/store/flight-search.js`) and under the
price on the fare page (`flight-detail.js`). Live flight search is on the `/store/` homepage (the flights.html page is a
wireframe). Counsel should confirm the wording, whether 399.84 wants a per-passenger breakdown (we show the total for the
searched passengers) and whether 399.85 also wants a link per airline. Ask the owner for the deploy word; the exposure is
live now.

### W2. Cloudflare Analytics Engine
The owner enables it (their step, instructions already given): https://dash.cloudflare.com/5fc047da9d0ef6fe7b8e8cfe2f939e0e/workers/analytics-engine
(Cloudflare printed this link in the 10089 error). When they say it is on and say "go": in a deploy copy uncomment exactly
one line in `wrangler.jsonc`: `"analytics_engine_datasets": [{ "binding": "STATS", "dataset": "tourguid_web_events" }],`,
test, dry-run, deploy. If Cloudflare answers "code 10089 You need to enable Analytics Engine" nothing changes on the live
site (atomic) and the owner has not finished the step. Afterwards confirm the dataset appears on that dashboard page after
one request. What `src/index.js` writes per `/api/store/*` request: route, status, status class, country, bot/browser,
flights trip type, destination name for place routes, a note up to 60 characters, milliseconds. Never IP, cookies, typed
text, dates or passenger counts. Retention 3 months; Free plan 100,000 writes a day (Cloudflare says billing is not active).
Optional improvement: pass `X-TourGuid-Referral` as the note for the `go` route so recorded versus not-recorded counts
appear per day.
Reading the numbers needs the owner's read-only token ("Account Analytics: Read"; My Profile, API Tokens, Create Token,
custom; never pasted into chat; TourGuid-Security reviews it). Growth plan row "The read-only Cloudflare token web-stats
needs" is Not started.

### W3. Search Console BigQuery export: DONE 3 Oct 2026, 23:15 PDT (reported by TG-Web-1A)
The export is ACTIVE for the tourguid.net domain property. Cloud project ID `tourguid-search-data`, dataset `searchconsole`,
location United States (US); the project is linked to the owner's "My Billing Account" (Google required it, though its page
does not say billing is mandatory). The first export lands within 48 hours, with no backfill. STILL TO DO: verify the tables
after 48 hours (do not assume their names), and the owner's own sitemap submission (https://tourguid.net/sitemap.xml). The text
below is kept for the BigQuery reader conditions.
Already in your hands; you verified the steps against Google's page. Record project ID, dataset, location and start date
in the Morning Package doc and tell TG-Mobile-1. TG-Mobile-1 added: reading BigQuery from web-stats needs (1) an
`api_sources` row through the API-library gate, (2) a read-only service account whose key the owner sets as a secret on
each tier directly (never in chat or a file), (3) a cost line before it ships. Also from Google's page: keep the dataset's
table expiration at 14 days or longer and do not change the table schema; location is hard to change once exporting; whether
billing is required is unconfirmed (ask the owner to send the exact wording of any billing message).
Also the owner's own item: submit https://tourguid.net/sitemap.xml in Search Console (8 URLs, no lastmod).

### W4. Registry-backed handoff sheet
Built and live, invisible while flags are off: `public/store/supplier-link.js`, `journey-ui.js`, `handoff.css`, Worker route
`/api/store/providers` (`src/store-worker.js`). Contract with the app (TG-Mobile-1A, 3 Oct): rows in this order, labelled
facts not sentences: Payment party; Funds received by (only when it differs from the payment party, compared trimmed,
whitespace-collapsed, case-insensitive); Terms (https address plus " (version X)"); Cancellation & refunds; then each that
exists as its own row: Support phone (tel:), Support email (mailto:), Support page, Support address (plain text, last).
What to watch: when TG-Mobile-1 applies 391 and deploys store-search to a tier that tourguid.net reads,
`https://tourguid.net/api/store/providers` flips from 404 to 200 with eight providers (Viator, GetYourGuide, OpenTable
handoff on; Duffel, Tiqets, Nuitee, KAYAK, Skyscanner off; all unverified). Which tier the website reads is unconfirmed
(likely Dev: production returns the 25-place gallery). TG-Mobile-1 will tell you the day the owner applies the migrations.
Switching the sheet on in production needs: the owner's decision (my recommendation: `plan.handoff_sheet` on,
`plan.require_verified_provider` off, otherwise every provider is refused until verified); then a code change, because
production currently has NO way to turn a flag on (only preview hosts honour `?tgflags=`). Add to
`public/store/feature-flags.js` a list such as `const enabled = []` (names the owner switched on, a code change and a
deploy) and compute each flag as `enabled.includes(name) || asked.has(name)`; extend `test/feature-flags.test.mjs`
(production must still ignore asking, and honour the list). Deploy, then check live: "Book on Viator" opens the sheet; a
Tiqets card says "Not available yet"; no console errors; rollback ready (previous version id). There is no staging copy of
the Store, so the first look with real registry rows is at the flip. Verified wording for a provider needs no web deploy:
once TG-Mobile-1 records a verification, the sheet shows the facts within about 6 minutes (browser 1 minute plus edge 5).

### W5. Tiqets on the web
Order: 391/395 on a tier; store-search accepts tiqets; then the Worker's `SUPPLIER_HOSTS` (exact hosts) and
`LEDGER_PROVIDERS` get Tiqets; then, and only after the display-terms answer exists in writing, release `5ec2188`. The real
Tiqets `product_url` host is unknown (the only host in the tree is www.tiqets.com); someone must print about 20 real hosts
from a live `tiqets_search` answer (TG-Mobile-1A holds the key as TIQETS_API_KEY).

### W6. SEO public layer (Morning Package item 1)
Audit of the live site on 3 October: the Store pages are client-rendered shells (about 270 words of generic raw HTML; the
cards arrive by JavaScript); `?destination=` variants return the same title, description and H1; the Store pages have no
canonical link (the homepage does); only the homepage has Open Graph tags and JSON-LD; the sitemap has 8 URLs and no
lastmod (acceptable; add lastmod only from real change dates); `detail.html` is noindex. Run `python specs/tools/seo-audit.py`
to repeat it.
Quick wins needing no content decision (still need the owner's deploy word): a canonical link on each Store page pointing
at the clean URL (so every `?destination=` variant canonicalises), Open Graph and Twitter card tags (`/assets/og-1200x630.png`
exists), a BreadcrumbList JSON-LD block on the category pages (inline `application/ld+json` is fine under the CSP; the
homepage already has one).
The page engine (not started; proposals, not approved): Worker-rendered `/destinations/<slug>` (later `/activities/<slug>`)
from human-approved content records bundled at build time (fields: slug, name, region, country, coordinates, `published`,
`approvedBy`, `approvedAt`, original editorial sections such as summary, when to go, neighbourhoods, sample days), plus clearly
labelled supplier-sourced blocks (links through `/api/store/go`, `rel="sponsored"`, never a supplier rating aggregated into a
TourGuid rating). Gates: a validation step refuses to publish a record missing a named approver or its original text; an
unpublished record is a 404 and is absent from the sitemap; X-Robots-Tag and security headers are set in code (the `_headers`
file does not reach responses a Worker builds; HTML is not cached by the CDN without a Cache Rule); sitemap lastmod = approval
date. No FAQ or HowTo markup; Event markup only for a real single event on its own page. Google treats a supplier description
in a template as thin-affiliate content; AI-assisted text is allowed only with human fact-checking, and Google's updates in
2026 are still rolling, so judge a launch after the dust settles. BEFORE BUILDING get the owner's answers: who is the named
approver of each publish; which three destinations are the pilot (suggested Paris, Barcelona, Lisbon from the 25-place
gallery); where each page's original content comes from (suggested 200 to 400 words per destination written or fact-checked
by a named person).
Share pages (design now, build after TG-Mobile-1's visibility model and redacted public view exist): default
`X-Robots-Tag: noindex` and crawlable (never blocked in robots.txt, Google cannot see a noindex on a blocked URL); tokens at
least 128 random bits; `Referrer-Policy: no-referrer`; no third-party scripts (NOTE: `src/index.js` injects the Cloudflare
Web Analytics beacon into every HTML response, which is a third-party script, so share pages must be excluded); `noreferrer` on
affiliate links; read only from the redacted public view (no co-travellers' names, generic preview text); a report link,
`rel="ugc nofollow"` on user links, `rel="sponsored"` on provider links.
Measurement without a beacon: aggregate first-party counts; join Search Console to signups by landing path and day (the website
has no signups yet); honour Global Privacy Control; the Analytics Engine dataset (W2) is the first-party source.

### W7. KAYAK
The owner already sent an application (do NOT prepare or send another). Ask the owner what it contained (which KAYAK product,
which site, any traffic or product claims, where the reply goes) and record it. When KAYAK answers: read its terms on price
display, caching and competitor comparison before anything is agreed; ask whether deeplink or widget access is open if only the
API was requested; never claim traffic we lack; tell TG-Mobile-1 (the gateway and the registry, where kayak is seeded unverified,
depend on it).

### W8. Cloudflare crawler check, owner's half
Black-box result (3 October): live robots.txt equals our file (no Cloudflare-added AI-bot lines), and search and AI crawler user
agents all got 200 with no challenge on `/` and `/store/`. Spoofed agents prove little about verified crawlers. The definitive
tests are the owner's: Search Console URL Inspection "Test live URL" for https://tourguid.net/ and a Store page, and Cloudflare
Security events for blocked Googlebot or Bingbot requests. Follow up with them.

### W9. Destination photos have no key
`/api/store/hero-photo?destination=Paris` answers `{"photos":[],"image":null,"source":"no_key"}` and `/api/store/health` says
`heroPhoto: fallback_only`, because the Worker has no `PEXELS_API_KEY` secret (only `STORE_CALLER_SECRET` and
`STORE_SEARCH_URL`). I did not check how the gallery tiles look as a result (static photos exist for only some places in
`public/assets/photos`). Ask the owner whether they have a Pexels API key; they set it themselves with
`npx wrangler secret put PEXELS_API_KEY` (typed privately, never in chat). No deploy is needed.

### W10. Plan B and z1 deploys: Plan B pass 2 DONE 3 Oct 2026, 23:27 PDT (reported by TG-Web-1A)
Worker version `28ae012d-561a-4a30-a4e2-c9c06e40d0dd` = the previous z1 deploy (`5bfe898`) plus ONLY the three Plan B commits
`b0bb9f4`, `7c3881f`, `3d62e64`, built in a clean worktree on the owner's word ("Deploy the Plan B commits"). NOT shipped:
TG-Web-1's three "Homepage preview" commits `156c32f`, `306a1a2`, `899edc4` (public/homepage-temp only); they are still
undeployed on z1 and the live homepage-temp is as TG-Web-1 last deployed it. Ask the owner if they want them out too. The
z1 working tree's git-ignored `public/app` is stale (built before `7c3881f`): rebuild before any deploy from it. The owner's
own look at the live pages is the last check (Access sign-in cannot be done by a session). Hotel photos wait on the owner's
word about sources and credits.

### W11. Held; do not start
Web sign-in and account page: hold until email-code sign-in exists in the app (TG-Mobile-1), Production only, per-tier link
rules. Control reskin: hold until the owner rules on the ring-fence. Anything attributing a person: hold. Fares from a gateway
provider: full price (14 CFR 399.84) and the baggage notice (399.85); Duffel markup and "Book on Duffel" stay paused.
Explore prototype and the spec section 7 exports are already yours (owner approved on 2 October; Explore waits for P0/P1).

### W12. Keep the trackers current
Revised Plan tracker row (update the status note when 391 or the flag flips); Growth plan Phase 0 table (the analytics dataset
row stays blocked until W2); Morning Package doc (the website section); memory files above.
