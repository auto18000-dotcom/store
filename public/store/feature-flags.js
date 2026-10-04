// Switches for the Revised Plan on the public Store. The names are the keys of context_feature_flags (plan.*), so the
// website and the app talk about the same flags. Every flag is OFF by default: with all of them off, the Store looks
// and behaves as it did before the Revised Plan.
//
// The website has no database of its own, so a flag is turned on here (a code change and a deploy). Only a preview can
// turn one on without that: add ?tgflags=plan.handoff_sheet to the address (several, separated by commas), or keep the
// same list in localStorage under "tg-flags". Preview hosts are named below; on any other host, including the
// workers.dev address that serves the production Worker, both are ignored.
//
// plan.bookings_needed, plan.plus_gates and plan.plus_review have no surface on this site (it has no sign-in and no
// trips), so they are not defined here and nothing on the site can draw review styling.
(() => {
  const names = [
    // The sheet shown before a provider's page opens. Off: links open as they did.
    'plan.handoff_sheet',
    // Refuse a handoff to a provider with no current verified profile. Applies to the sheet and does not need it on.
    'plan.require_verified_provider',
    // The Explore prototype (P2).
    'plan.explore',
  ];
  // ── The owner's switch, everywhere including production ───────────────────
  //
  // A name in this list is ON for every visitor on every host. It is the ONLY
  // way a flag reaches production: `?tgflags=` and the stored list are preview
  // conveniences and are ignored on tourguid.net, by design, so that nobody can
  // turn a traveller-visible change on by sharing a link.
  //
  // Changing it is a code change, a commit and a deploy, and that is deliberate:
  // it means every switch-on is reviewable, attributable and revertible by
  // redeploying the previous version. The owner decides what goes in; a session
  // does not add a name on its own.
  //
  // EMPTY MEANS NOTHING IS ON, which is the state the Revised Plan requires
  // until the owner says otherwise. Adding `plan.handoff_sheet` here is what
  // shows the handoff sheet to the public; `plan.require_verified_provider`
  // alongside it would refuse EVERY provider, since none is verified yet.
  const enabled = [];

  const previewHost = /^(localhost|127\.0\.0\.1|\[::1\]|[^.]+\.localhost|z1\.tourguid\.net)$/;
  const preview = previewHost.test(location.hostname);
  const asked = new Set();
  // Each source on its own: storage can be unavailable (blocked, private window) and must not take the address with it.
  const read = (get) => {
    try {
      return String(get() || '');
    } catch {
      return '';
    }
  };
  if (preview) {
    for (const list of [
      read(() => new URLSearchParams(location.search).get('tgflags')),
      read(() => localStorage.getItem('tg-flags')),
    ]) {
      for (const name of list.split(',')) if (names.includes(name.trim())) asked.add(name.trim());
    }
  }
  // The owner's list OR a preview's asking. `asked` is empty on every
  // non-preview host, so in production this reduces to the list alone.
  const flags = Object.freeze(
    Object.fromEntries(names.map((name) => [name, enabled.includes(name) || asked.has(name)]))
  );
  window.TourGuidFlags = Object.freeze({
    get: (name) => flags[name] === true,
    all: () => ({ ...flags }),
    preview,
  });
})();
