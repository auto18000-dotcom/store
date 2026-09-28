// A stub AnalyticsAdapter (Engineering Specifications §8). No analytics platform is approved yet, so this keeps the CONTRACT (event names,
// required properties, consent gating, deduplication) without sending anything anywhere. Swapping in an approved platform later means
// replacing only the body of `send()`. Essential events (none defined here) would fire regardless of consent; everything below is
// nonessential and is only sent once consent for "nonessential" is granted.
(() => {
  const config = window.TOURGUID_LANDING_CONFIG || {};
  const debug = new URLSearchParams(location.search).has('debug');
  const seen = new Set(); // event_id values already sent, so a reload or duplicate call cannot double-count completion.
  let consented = false;
  window.__tgAnalyticsEvents = window.__tgAnalyticsEvents || [];

  const send = (name, props) => {
    const event = { name, schema_version: 1, content_version: config.contentVersion || null, ts: Date.now(), ...props };
    window.__tgAnalyticsEvents.push(event);
    if (debug) console.log('[analytics]', name, event);
    // A real platform call would go here, behind the same consent gate, never delaying navigation.
  };

  const track = (name, props = {}) => {
    if (!consented) return;
    if (props.event_id) { if (seen.has(props.event_id)) return; seen.add(props.event_id); }
    send(name, props);
  };

  const viewportClass = () => (innerWidth >= 1024 ? 'desktop' : innerWidth >= 768 ? 'tablet' : 'mobile');

  window.TourGuidAnalytics = {
    setConsent(value) {
      consented = value === true;
      if (consented) track('landing_view', { page_path: location.pathname, viewport_class: viewportClass() });
    },
    hasConsent: () => consented,
    track,
    viewportClass,
  };
})();
