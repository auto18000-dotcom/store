// The landing page's typed configuration (Engineering Specifications §5, "Content and configuration contract"). One source for copy, routes, plan
// identifiers, amounts and promo metadata. The HTML carries the real, readable values directly (so the page works with no JavaScript and nothing
// depends on this file to be seen); landing.js reads this file and checks the DOM agrees with it, the way a real build's validation step would,
// and this is where a future build step reads its inputs from. Amounts are integer minor units (cents) with an explicit ISO currency: never a
// bare dollar sign. contentVersion changes whenever copy, prices or the promo change, for analytics segmentation and cache invalidation.
window.TOURGUID_LANDING_CONFIG = {
  contentVersion: "2026-09-27-preview-2",
  logo: { src: "./tourguid-mark-on-dark.svg", width: 40, height: 40, alt: "" },
  hero: {
    // A real, credited Wikimedia Commons photo (Navagio Beach) as of 2026-09-27; nothing reads this field.
    photo: "./assets/photos/hero-beach-1600.jpg",
  },
  routes: {
    // No real sign-up/sign-in route exists yet. Every button that would open one leads to under-construction.html instead (owner, 2026-09-27).
    signup: "./under-construction.html",
    signin: "./under-construction.html",
    store: "https://tourguid.net/store/",
    privacy: "https://app.tourguid.net/privacy.html",
    terms: "https://app.tourguid.net/terms.html",
    support: "mailto:admin@tourguid.net",
  },
  // Pricing is not shown anywhere on the page as of 2026-09-27 (owner's instruction: remove every dollar-amount reference) -- the amount and the
  // annual price itself are still undecided (open item: $36 vs $39). Kept here, not deleted, so the eventual real numbers have a single place to
  // land instead of being invented fresh when pricing returns to the page; nothing currently reads these two fields.
  plans: [
    {
      id: "annual_membership",
      displayName: "Annual membership",
      amountMinor: null,
      currency: "USD",
      billingUnit: "year",
      benefits: ["[Preview] What annual membership includes", "[Preview] Eligibility for this plan", "[Preview] Renewal and cancellation terms"],
    },
    {
      id: "single_use",
      displayName: "Single use",
      amountMinor: null,
      currency: "USD",
      billingUnit: null,
      benefits: ["[Preview] What one use covers", "[Preview] Eligibility for this plan", "[Preview] Renewal and cancellation terms"],
    },
  ],
  promo: {
    id: "three_months_free",
    text: "Free for three months upon sign-up",
    eligiblePlans: [], // [Preview] Eligibility not yet approved: shown near every plan and CTA, but which plans/accounts qualify is undecided.
    termsUrl: null,
    enabled: false, // not shown on the page currently -- see the comment on `plans` above
  },
  // A stub adapter (§8): no analytics platform is approved yet. It keeps the exact event names and properties the spec defines, logging to
  // memory (window.__tgAnalyticsEvents) and, with ?debug=analytics in the URL, to the console. Swapping in an approved platform is a one-file change.
  analytics: { platform: "none (stub adapter)", consentRequiredFor: ["nonessential"] },
};
