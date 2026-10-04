// Landing page interactions. The page works without this file: the links show, the FAQ is native <details>, and every price is in the HTML already.
// This file adds: the search (tabs and the Search button), the consent banner, analytics event wiring (behind consent), and a runtime check that the
// prices in the page still agree with config.js -- what a real build's "validate production values" step would do, run here for the preview.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const config = window.TOURGUID_LANDING_CONFIG || null;
  const analytics = window.TourGuidAnalytics || null;

  // ---------------------------------------------------------------- config check (stands in for build-time validation)
  if (config) {
    for (const el of document.querySelectorAll('[data-plan]')) {
      const plan = config.plans.find((p) => p.id === el.dataset.plan);
      const shown = el.dataset.amountMinor;
      if (!plan) { console.error(`[config] "${el.dataset.plan}" is on the page but not in config.js`); continue; }
      if (String(plan.amountMinor) !== shown) console.error(`[config] ${plan.id}: page shows ${shown}, config.js says ${plan.amountMinor}`);
    }
  }

  // (There is no menu to open any more: the header is the one in site.css, and its links wrap on a narrow screen instead of hiding behind a button.)

  // ---------------------------------------------------------------- search tabs (which Store page the quick-search form targets)
  const search = document.getElementById('quick-search');
  const tabs = document.querySelector('.tabs');
  if (search && tabs) {
    tabs.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-target]');
      if (!btn) return;
      for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
      search.action = btn.dataset.target;
      if (analytics) analytics.track('nav_click', { link_id: `search_tab_${btn.id}`, placement: 'search', destination_type: 'internal' });
    });
  }

  // The Search button. The form is a plain GET form, and the site's Content-Security-Policy says form-action 'none', so the browser quietly refused to submit it: from 27 Sep to 4 Oct a
  // visitor typed a destination, pressed Search and nothing happened (found 2026-10-04 by reading the violation the browser reports). Going to the page from script is not a form
  // submission, so it works under the same policy, which stays as strict as it was. Every field that has a name goes with it, as the form would have sent it.
  if (search) {
    search.addEventListener('submit', (event) => {
      event.preventDefault();
      const target = new URL(search.getAttribute('action') || '/store/hotels.html', window.location.href);
      target.search = new URLSearchParams(new FormData(search)).toString();
      window.location.assign(target.href);
    });
  }

  // ---------------------------------------------------------------- consent (Accept / Reject nonessential / Manage)
  const banner = document.getElementById('consent-banner');
  const manageLink = document.getElementById('consent-manage');
  const KEY = 'tg_consent';
  const showBanner = () => { if (banner) { banner.hidden = false; banner.querySelector('button').focus(); } };
  const hideBanner = () => { if (banner) banner.hidden = true; };
  const apply = (accepted) => { try { localStorage.setItem(KEY, accepted ? 'accepted' : 'rejected'); } catch { /* private browsing: ask again next visit */ } if (analytics) analytics.setConsent(accepted); };
  if (banner) {
    banner.querySelector('[data-consent="accept"]').addEventListener('click', () => { apply(true); hideBanner(); });
    banner.querySelector('[data-consent="reject"]').addEventListener('click', () => { apply(false); hideBanner(); });
  }
  if (manageLink) manageLink.addEventListener('click', (e) => { e.preventDefault(); showBanner(); });
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* unavailable */ }
  if (stored === 'accepted') apply(true);
  else if (stored === 'rejected') apply(false);
  else showBanner();

  // ---------------------------------------------------------------- analytics event wiring (all gated on consent inside the adapter)
  if (analytics) {
    for (const a of document.querySelectorAll('.tg-top a, .tg-footer a')) {
      a.addEventListener('click', () => analytics.track('nav_click', {
        link_id: a.dataset.navId || a.textContent.trim().toLowerCase().replace(/\s+/g, '_'),
        placement: a.closest('.tg-top') ? 'header' : 'footer',
        destination_type: a.getAttribute('href').startsWith('#') ? 'anchor' : a.hostname === location.hostname ? 'internal' : 'external',
      }));
    }
    for (const a of document.querySelectorAll('[data-cta]')) {
      a.addEventListener('click', () => {
        analytics.track('cta_click', { cta_id: a.dataset.cta, placement: a.dataset.placement || null, plan_id: a.dataset.plan || null, promo_id: config?.promo?.enabled ? config.promo.id : null });
        if (a.dataset.plan) {
          const plan = config?.plans.find((p) => p.id === a.dataset.plan);
          if (plan) analytics.track('plan_select', { plan_id: plan.id, amount_minor: plan.amountMinor, currency: plan.currency });
        }
      });
    }
    const pricing = document.getElementById('pricing');
    if (pricing && 'IntersectionObserver' in window) {
      let timer = null, fired = false;
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timer) timer = window.setTimeout(() => { if (!fired) { fired = true; analytics.track('pricing_view', { promo_id: config?.promo?.id || null }); io.disconnect(); } }, 1000);
        } else if (timer) { window.clearTimeout(timer); timer = null; }
      }, { threshold: [0, 0.5, 1] });
      io.observe(pricing);
    }
    for (const d of document.querySelectorAll('.faq details')) {
      d.addEventListener('toggle', () => analytics.track('faq_toggle', { faq_id: d.dataset.faqId || null, expanded: d.open }));
    }
    // signup_start / signup_complete are deliberately NOT fired here: no application initialization exists yet to report (see
    // config.js and under-construction.html). Firing them from a landing click would misrepresent a click as a registration.
  }
})();
