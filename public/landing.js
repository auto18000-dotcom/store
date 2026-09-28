// Landing page interactions. The page works without this file: the links show, the FAQ is native <details>, and every price is in the HTML already.
// This file adds: the menu disclosure below 1024 px, the consent banner, analytics event wiring (behind consent), and a runtime check that the
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

  // ---------------------------------------------------------------- menu disclosure
  const button = document.querySelector('.menu-btn');
  const nav = document.getElementById('site-nav');
  if (button && nav) {
    const setOpen = (open, restoreFocus) => {
      button.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      if (!open && restoreFocus) button.focus();
    };
    const isOpen = () => button.getAttribute('aria-expanded') === 'true';
    button.addEventListener('click', () => setOpen(!isOpen(), false));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) { event.preventDefault(); setOpen(false, true); } });
    nav.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const section = document.getElementById(link.getAttribute('href').slice(1));
      const heading = section && section.querySelector('h1, h2');
      setOpen(false, false);
      if (heading) { if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1'); window.setTimeout(() => heading.focus({ preventScroll: true }), 0); }
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', () => setOpen(false, false));
  }

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
    for (const a of document.querySelectorAll('.site-nav a, .site-footer a')) {
      a.addEventListener('click', () => analytics.track('nav_click', {
        link_id: a.dataset.navId || a.textContent.trim().toLowerCase().replace(/\s+/g, '_'),
        placement: a.closest('.site-header') ? 'header' : 'footer',
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
