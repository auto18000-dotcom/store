// public/store/supplier-link.js: no supplier address reaches a page as the supplier's own address.
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, load } from './helpers.mjs';

const VIATOR = 'https://www.viator.com/tours/Paris/Seine-Cruise/d479-1P1?pid=P00012345&mcid=42383&medium=link';
const PAGE = { pathname: '/store/activities', search: '?destination=Paris&lat=48.8566&lon=2.3522&from=2026-11-01' };

// A browser always has fetch; with a sheet flag on, binding a card warms the registry, which asks for it.
const supplier = (options = {}) => load('supplier-link.js', { location: PAGE, fetch: async () => ({ ok: false }), ...options }).TourGuidSupplier;
const go = (href) => new URL(href, 'https://tourguid.net');

test('goHref carries the URL exactly as given and only the path of the page', () => {
  const url = go(supplier().goHref(VIATOR));
  assert.equal(url.pathname, '/api/store/go');
  assert.equal(url.searchParams.get('url'), VIATOR, 'affiliate parameters must survive untouched');
  assert.equal(url.searchParams.get('page'), '/store/activities', 'the visitor search must not travel');
});

test('anything that is not plain https is no link at all', () => {
  const s = supplier();
  for (const bad of [
    'http://www.viator.com/x',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://user:secret@www.viator.com/x',
    'https://www.viator.com\\@evil.example/',
    '//evil.example/x',
    'not a url',
    '',
    '   ',
    null,
    undefined,
  ]) {
    assert.equal(s.goHref(bad), null, `goHref(${JSON.stringify(bad)})`);
    assert.equal(s.name(bad), null, `name(${JSON.stringify(bad)})`);
    const el = new FakeEl();
    assert.equal(s.bind(el, bad, { bookable: true }), false, `bind(${JSON.stringify(bad)})`);
    assert.deepEqual(Object.keys(el.attrs), [], 'a refused URL leaves the element untouched');
    assert.equal(el.href, undefined);
  }
});

test('names come from the host, never from a lookalike', () => {
  const s = supplier();
  const names = {
    'https://www.viator.com/tours/x': 'Viator',
    'https://viator.com/': 'Viator',
    'https://www.getyourguide.com/x': 'GetYourGuide',
    'https://www.opentable.com/r/x': 'OpenTable',
    'https://www.expedia.com/x': 'Expedia',
    'https://links.duffel.com/x': 'Duffel',
    'https://www.google.com/maps/place/Eiffel+Tower': 'Google Maps',
    'https://maps.google.com/?q=x': 'Google Maps',
    'https://www.google.com/search?q=viator': 'google.com',
    'https://evilviator.com/x': 'evilviator.com',
    'https://viator.com.evil.example/x': 'viator.com.evil.example',
    'https://something-else.example/x': 'something-else.example',
  };
  for (const [url, expected] of Object.entries(names)) assert.equal(s.name(url), expected, url);
});

test('flags off: a bookable item is a tracked link, never the supplier address', () => {
  const el = new FakeEl();
  assert.equal(supplier({ flags: [] }).bind(el, VIATOR, { bookable: true, title: 'Seine cruise' }), true);
  assert.ok(el.href.startsWith('/api/store/go?url='), el.href);
  assert.ok(!el.href.startsWith('https://'), 'the page must not carry the supplier address');
  assert.equal(el.target, '_blank');
  assert.equal(el.rel, 'noopener');
  assert.equal(el.attrs.role, undefined);
});

test('a hostile address from data is still only ever behind /api/store/go, which refuses it', () => {
  const el = new FakeEl();
  assert.equal(supplier().bind(el, 'https://evil.example/phish?x=1', { bookable: false }), true);
  assert.ok(el.href.startsWith('/api/store/go?url=https%3A%2F%2Fevil.example'), el.href);
});

test('whitespace around an address is trimmed, nothing else is changed', () => {
  assert.equal(go(supplier().goHref(`  ${VIATOR}\n`)).searchParams.get('url'), VIATOR);
});

test('a non-bookable item stays a tracked link even with the sheet on', () => {
  const el = new FakeEl();
  supplier({ flags: ['plan.handoff_sheet'] }).bind(el, 'https://www.google.com/maps/place/Eiffel+Tower', { bookable: false });
  assert.ok(el.href.startsWith('/api/store/go?url='));
  assert.equal(el.attrs.role, undefined);
  assert.equal(el.listeners.click, undefined, 'no sheet for a place that cannot be booked');
});

for (const flag of ['plan.handoff_sheet', 'plan.require_verified_provider']) {
  test(`${flag} on: a bookable item opens the sheet and has no address to open without it`, () => {
    const opened = [];
    const journey = { handoffDialog: (url, item) => opened.push([url, item]) };
    const el = new FakeEl();
    el.href = '/stale';
    el.target = '_blank';
    el.rel = 'noopener';
    const s = supplier({ flags: [flag], journey });
    assert.equal(s.bind(el, ` ${VIATOR} `, { bookable: true, title: 'Seine cruise', type: 'Activity' }), true);

    assert.equal(el.href, undefined, 'no href to open in a new tab or copy');
    assert.equal(el.target, undefined);
    assert.equal(el.rel, undefined);
    assert.equal(el.attrs.role, 'button');
    assert.equal(el.tabIndex, 0);

    const click = el.fire('click');
    assert.equal(click.defaultPrevented, true);
    assert.deepEqual(JSON.parse(JSON.stringify(opened)), [[VIATOR, { title: 'Seine cruise', type: 'Activity' }]]);

    el.fire('keydown', { key: 'Enter' });
    el.fire('keydown', { key: ' ' });
    el.fire('keydown', { key: 'Tab' });
    assert.equal(opened.length, 3, 'Enter and Space open the sheet, Tab does not');
  });
}

test('sheet on but the sheet script is missing: the control does nothing rather than open the provider', () => {
  const el = new FakeEl();
  supplier({ flags: ['plan.handoff_sheet'] }).bind(el, VIATOR, { bookable: true });
  const click = el.fire('click');
  assert.equal(click.defaultPrevented, true);
  assert.equal(el.href, undefined);
});
