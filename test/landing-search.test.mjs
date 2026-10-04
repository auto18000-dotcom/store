// The homepage Search button (public/landing.js). It was dead from 27 Sep to 4 Oct 2026: the form is a plain GET form and the site's Content-Security-Policy says form-action 'none', so
// the browser refused to submit it and said nothing on the page. These tests run the real landing.js in a bare context.
//   node --test test/landing-search.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { FakeEl } from './helpers.mjs';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** The homepage as far as landing.js reaches: the quick-search form with its fields, and the tab bar that retargets it. */
function homepage({ fields = { destination: 'Lisbon', checkIn: '', checkOut: '', adults: '2' } } = {}) {
  const assigned = [];
  const search = Object.assign(new FakeEl(), { action: 'https://tourguid.net/store/hotels.html' });
  search.getAttribute = (name) => (name === 'action' ? search.action : null);
  const tabs = new FakeEl();
  const tabButtons = [];
  tabs.querySelectorAll = () => tabButtons;
  const tab = (id, target) => {
    const b = Object.assign(new FakeEl(), { id, dataset: { target }, closest: (sel) => (sel === 'button[data-target]' ? b : null) });
    tabButtons.push(b);
    return b;
  };
  const stays = tab('tab-stays', '/store/hotels.html');
  const activities = tab('tab-activities', '/store/activities.html');
  const byId = { 'quick-search': search };
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById: (id) => byId[id] ?? null,
    querySelector: (sel) => (sel === '.tabs' ? tabs : null),
    querySelectorAll: () => [],
    addEventListener() {},
    visibilityState: 'visible',
  };
  const ctx = {
    URL, URLSearchParams, console, setTimeout, clearTimeout,
    document,
    FormData: class { constructor() { this.pairs = Object.entries(fields); } [Symbol.iterator]() { return this.pairs[Symbol.iterator](); } },
    localStorage: { getItem: () => 'rejected', setItem() {} },
    matchMedia: () => ({ addEventListener() {} }),
  };
  ctx.window = ctx;
  ctx.location = { href: 'https://tourguid.net/', hostname: 'tourguid.net', assign: (url) => assigned.push(url) };
  vm.runInContext(fs.readFileSync(path.join(pub, 'landing.js'), 'utf8'), vm.createContext(ctx), { filename: 'landing.js' });
  return { search, tabs, stays, activities, assigned };
}

test('Search goes to the Store page with everything typed, and the browser is not left to submit the form (its policy refuses)', () => {
  const page = homepage({ fields: { destination: 'Lisbon', checkIn: '2026-11-02', checkOut: '2026-11-05', adults: '3' } });
  const event = page.search.fire('submit');
  assert.equal(event.defaultPrevented, true, 'the native submission is cancelled, because the policy would drop it');
  assert.deepEqual(page.assigned, ['https://tourguid.net/store/hotels.html?destination=Lisbon&checkIn=2026-11-02&checkOut=2026-11-05&adults=3']);
});

test('the tab chosen decides the page, and the typed words are escaped', () => {
  const page = homepage({ fields: { destination: 'São Paulo & Co', checkIn: '', checkOut: '', adults: '2' } });
  page.tabs.fire('click', { target: page.activities });
  page.search.fire('submit');
  assert.equal(page.assigned.length, 1);
  const url = new URL(page.assigned[0]);
  assert.equal(url.pathname, '/store/activities.html');
  assert.equal(url.searchParams.get('destination'), 'São Paulo & Co');
  assert.equal(url.origin, 'https://tourguid.net', 'a root-relative action stays on this site');
});

test('an empty destination still goes (the Store opens its own gallery), and a missing action falls back to the Stays page', () => {
  const page = homepage({ fields: { destination: '', adults: '2' } });
  page.search.action = '';
  page.search.fire('submit');
  assert.equal(page.assigned[0], 'https://tourguid.net/store/hotels.html?destination=&adults=2');
});

test('the page keeps its form pointed at this site\'s Store, with no hard-coded host, so a preview or a staging copy follows its own Store', () => {
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  assert.match(html, /<form class="search-fields" id="quick-search" action="\/store\/hotels\.html" method="get">/);
  const targets = [...html.matchAll(/data-target="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(targets.length, 5);
  for (const t of targets) assert.match(t, /^\/store\/[a-z]+\.html$/, t);
});
