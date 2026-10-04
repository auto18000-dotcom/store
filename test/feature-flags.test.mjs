// public/store/feature-flags.js: every flag is off, and only a preview host can turn one on without a deploy.
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { load, makeContext } from './helpers.mjs';

const NAMES = ['plan.handoff_sheet', 'plan.require_verified_provider', 'plan.explore'];
const flags = (location, storage) => load('feature-flags.js', { location, storage }).TourGuidFlags;
const storageOf = (value) => ({ getItem: () => value });

test('every flag is off by default', () => {
  const f = flags({ hostname: 'tourguid.net' });
  for (const name of NAMES) assert.equal(f.get(name), false, name);
  assert.equal(f.get('plan.something_else'), false);
  assert.equal(f.get(undefined), false);
  assert.equal(JSON.stringify(f.all()), JSON.stringify(Object.fromEntries(NAMES.map((n) => [n, false]))));
});

test('review styling has no flag on the website', () => {
  assert.equal(Object.keys(flags({ hostname: 'localhost' }).all()).some((n) => /review|plus/.test(n)), false);
});

test('production and every other host ignore both ways of asking', () => {
  for (const hostname of [
    'tourguid.net',
    'www.tourguid.net',
    'app.tourguid.net',
    'tourguid-web.example.workers.dev',
    'localhost.evil.example',
    'evil-localhost.example',
    'z1.tourguid.net.evil.example',
  ]) {
    const f = flags({ hostname, search: '?tgflags=plan.handoff_sheet,plan.explore' }, storageOf('plan.require_verified_provider'));
    assert.equal(f.preview, false, hostname);
    for (const name of NAMES) assert.equal(f.get(name), false, `${hostname} ${name}`);
  }
});

test('a preview host honours the address and the stored list, and only for names that exist', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'dev.localhost', 'z1.tourguid.net']) {
    const f = flags({ hostname, search: '?destination=Paris&tgflags=plan.handoff_sheet,plan.unknown' }, storageOf(' plan.explore '));
    assert.equal(f.preview, true, hostname);
    assert.equal(f.get('plan.handoff_sheet'), true, hostname);
    assert.equal(f.get('plan.explore'), true, hostname);
    assert.equal(f.get('plan.require_verified_provider'), false, hostname);
    assert.equal(f.get('plan.unknown'), false, hostname);
  }
});

test('blocked storage does not take the address with it', () => {
  const blocked = { getItem: () => { throw new Error('SecurityError'); } };
  const f = flags({ hostname: 'localhost', search: '?tgflags=plan.handoff_sheet' }, blocked);
  assert.equal(f.get('plan.handoff_sheet'), true);
  assert.equal(flags({ hostname: 'localhost', search: '' }, undefined).get('plan.handoff_sheet'), false, 'no storage object at all');
});

test('the flags cannot be changed afterwards', () => {
  const ctx = load('feature-flags.js', { location: { hostname: 'tourguid.net' } });
  assert.equal(Object.isFrozen(ctx.TourGuidFlags), true);
  assert.throws(() => { 'use strict'; ctx.TourGuidFlags.get = () => true; }, TypeError);
  assert.equal(ctx.TourGuidFlags.get('plan.handoff_sheet'), false);
});

// ── The owner's switch (W4): the only way a flag reaches production ─────────
//
// These run the REAL source with the list substituted, rather than a copy of
// the logic, so a change to how `enabled` is combined is caught here.

const SOURCE = readFileSync(new URL('../public/store/feature-flags.js', import.meta.url), 'utf8');

/** The module as it would ship with `names` switched on by the owner. */
const withEnabled = (names, location, storage) => {
  const patched = SOURCE.replace('const enabled = [];', `const enabled = ${JSON.stringify(names)};`);
  assert.notEqual(patched, SOURCE, 'the `const enabled = [];` line still exists to substitute');
  const ctx = makeContext({ location, storage });
  vm.runInContext(patched, ctx, { filename: 'feature-flags.js' });
  return ctx.TourGuidFlags;
};

test('the shipped list is EMPTY, so nothing is on in production', () => {
  // Not style: with the Revised Plan's flags off, the Store behaves as it did
  // before it. A name appearing here is a traveller-visible change and must be
  // the owner's deliberate commit, visible in a diff — never a side effect.
  const enabled = /const enabled = \[([^\]]*)\]/.exec(SOURCE);
  assert.ok(enabled, 'the owner-switch list still exists');
  assert.equal(enabled[1].trim(), '', 'no flag is switched on in the shipped file');
});

test("the owner's list turns a flag on in production, where asking cannot", () => {
  const f = withEnabled(['plan.handoff_sheet'], { hostname: 'tourguid.net', search: '?tgflags=plan.explore' });
  assert.equal(f.get('plan.handoff_sheet'), true, 'the listed flag is on for every visitor');
  assert.equal(f.get('plan.explore'), false, 'and production still ignores the address');
  assert.equal(f.preview, false);
});

test('a listed flag and an asked one combine on a preview, and only there', () => {
  const f = withEnabled(['plan.handoff_sheet'], { hostname: 'localhost', search: '?tgflags=plan.explore' });
  assert.equal(f.get('plan.handoff_sheet'), true);
  assert.equal(f.get('plan.explore'), true);
});

test('a name in the list that is not a known flag changes nothing', () => {
  const f = withEnabled(['plan.not_a_flag', 'plan.plus_review'], { hostname: 'tourguid.net' });
  for (const name of NAMES) assert.equal(f.get(name), false, name);
  // plan.plus_review has no surface here and must not become one by being typed
  // into the list: review styling never ships, and this is the third refusal.
  assert.equal(f.get('plan.plus_review'), false);
  assert.equal(Object.keys(f.all()).includes('plan.plus_review'), false);
});
