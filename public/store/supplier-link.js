// The one place where a URL that arrives as DATA becomes an outbound link on the Store. A supplier is never linked by
// its own address: the link goes through /api/store/go (exact host allow-list, referral record, no open redirect), and
// when the handoff sheet is on, a bookable item opens the sheet first. A URL that is not plain https becomes no link.
// Links written by hand in the page's own markup are not routed here; they are reviewed where they are written.
(() => {
  const GO = '/api/store/go';

  // Names shown on the sheet until the provider registry answers. A host that matches none is shown as the host
  // itself, never as a brand it was not matched to.
  const NAMES = [
    ['viator.com', 'Viator'],
    ['getyourguide.com', 'GetYourGuide'],
    ['opentable.com', 'OpenTable'],
    ['expedia.com', 'Expedia'],
    ['duffel.com', 'Duffel'],
    ['tiqets.com', 'Tiqets'],
  ];
  const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);

  // The same shape of check the Worker makes (supplierOf): https only, no credentials, no backslash.
  const parse = (raw) => {
    const text = String(raw == null ? '' : raw).trim();
    if (!text || text.includes('\\')) return null;
    try {
      const url = new URL(text);
      return url.protocol === 'https:' && !url.username && !url.password ? { url, text } : null;
    } catch {
      return null;
    }
  };

  const name = (raw) => {
    const parsed = parse(raw);
    if (!parsed) return null;
    const host = parsed.url.hostname.replace(/^www\./, '');
    if (host === 'maps.google.com' || (host === 'google.com' && parsed.url.pathname.startsWith('/maps'))) return 'Google Maps';
    const known = NAMES.find(([domain]) => hostIs(host, domain));
    return known ? known[1] : host;
  };

  // The URL travels exactly as given: a supplier's affiliate parameters are in it. The page is a path only, because the
  // Worker keeps a path and never a query, and a visitor's search terms stay with the visitor.
  const goHref = (raw) => {
    const parsed = parse(raw);
    return parsed ? `${GO}?url=${encodeURIComponent(parsed.text)}&page=${encodeURIComponent(location.pathname)}` : null;
  };

  // The provider registry, through the Worker (/api/store/providers). Asked only when a sheet flag is on, once per page.
  // Any failure, and a tier without the registry, is an empty answer: the sheet then says only where the traveller goes.
  let registry = null;
  const warm = () => {
    if (!registry) {
      registry = fetch('/api/store/providers', { headers: { Accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => (body && Array.isArray(body.providers) ? body.providers : []))
        .catch(() => []);
    }
    return registry;
  };

  // The registry row for an address: the row with the longest allowed domain that the host equals or is a subdomain of
  // (the rule the registry's own allowed_hosts uses), or null. Waits a short while for the registry, never for long.
  const record = async (raw) => {
    const parsed = parse(raw);
    if (!parsed) return null;
    let timer;
    const rows = await Promise.race([
      warm(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve([]), 2500);
      }),
    ]);
    clearTimeout(timer);
    let best = null;
    let bestLength = 0;
    for (const row of rows) {
      for (const domain of Array.isArray(row.hosts) ? row.hosts : []) {
        if (domain.length > bestLength && hostIs(parsed.url.hostname, domain)) {
          best = row;
          bestLength = domain.length;
        }
      }
    }
    return best;
  };

  const flag = (key) => !!(window.TourGuidFlags && window.TourGuidFlags.get(key));

  // Make `el` (an <a> the caller created) the link for `raw`. item: { bookable, title, type }. Returns false, leaving
  // `el` untouched, when there is nothing safe to link to; the caller then leaves the control out.
  const bind = (el, raw, item = {}) => {
    const parsed = parse(raw);
    if (!parsed) return false;
    if (item.bookable && (flag('plan.handoff_sheet') || flag('plan.require_verified_provider'))) {
      warm();
      // The sheet comes first, so the control carries no address that could be opened without it (new tab, copy link).
      el.removeAttribute('href');
      el.removeAttribute('target');
      el.removeAttribute('rel');
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.style.cursor = 'pointer';
      const open = (event) => {
        event.preventDefault();
        const journey = window.TourGuidJourney;
        if (journey && journey.handoffDialog) journey.handoffDialog(parsed.text, { title: item.title, type: item.type });
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
      });
      return true;
    }
    el.href = goHref(parsed.text);
    el.target = '_blank';
    el.rel = 'noopener';
    return true;
  };

  window.TourGuidSupplier = Object.freeze({ goHref, name, bind, record, warm });
})();
