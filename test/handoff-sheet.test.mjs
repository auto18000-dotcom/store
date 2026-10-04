// The handoff sheet (public/store/journey-ui.js, supplier-link.js): what it says, and where each claim may come from.
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, linesOf, makeContext, run } from './helpers.mjs';

const VIATOR = 'https://www.viator.com/tours/Paris/Seine-Cruise/d479-1P1?pid=P00012345&mcid=42383&medium=link';
const ITEM = { title: 'Seine cruise', type: 'Activity' };
const SHEET = 'plan.handoff_sheet';
const REQUIRE = 'plan.require_verified_provider';

// A registry row as /api/store/providers sends it.
const row = (over = {}) => ({ key: 'viator', name: 'Viator', handoffEnabled: true, hosts: ['viator.com'], verified: false, ...over });
const VERIFIED = row({
  verified: true,
  paymentParty: 'Viator Inc., merchant of record',
  termsUrl: 'https://www.viator.com/terms',
  termsVersion: '2026-09',
  cancellationUrl: 'https://www.viator.com/cancel',
  support: { url: 'https://www.viator.com/support', email: 'help@viator.example', phone: '+1 555 0100', address: '1 Main St, Anytown' },
});

/** A page with both scripts loaded and nothing opened yet. */
function page({ flags = [SHEET], providers = [], ok = true, fetch } = {}) {
  const document = fakeDocument();
  const opens = [];
  const calls = [];
  const answer = fetch || (async (...args) => { calls.push(args); return { ok, json: async () => ({ providers }) }; });
  const ctx = makeContext({
    flags,
    document,
    fetch: answer,
    open: (...args) => opens.push(args),
    location: { pathname: '/store/activities', search: '?destination=Paris&from=2026-11-01' },
  });
  run(ctx, 'supplier-link.js');
  run(ctx, 'journey-ui.js');
  return { ctx, dialog: document.body.children[0], opens, calls };
}

/** Load both scripts, open the sheet for `url`, and give back what was built. */
async function sheet({ url = VIATOR, item = ITEM, wait = 30, ...options } = {}) {
  const opened = page(options);
  opened.ctx.TourGuidJourney.handoffDialog(url, item);
  await new Promise((resolve) => setTimeout(resolve, wait));
  return { ...opened, lines: linesOf(opened.dialog) };
}

const facts = (dialog) => {
  const list = dialog.querySelector('dl');
  if (!list) return null;
  const out = {};
  for (let i = 0; i < list.children.length; i += 2) out[list.children[i].textContent] = list.children[i + 1].textContent;
  return out;
};

test('no registry: the sheet says only where the traveller is going and whose terms apply', async () => {
  const { dialog, lines, opens } = await sheet({ ok: false });
  assert.deepEqual(lines, [
    'You are leaving TourGuid',
    'Continue to Viator',
    'Seine cruise · Activity',
    "Viator's own terms apply.",
    'You will go to viator.com.',
    'Continue to Viator ↗',
    'Cancel',
  ]);
  assert.equal(dialog.querySelector('dl'), null, 'no facts without a verified profile');
  assert.equal(dialog.open, true);
  assert.equal(dialog.attrs['aria-labelledby'], 'handoff-title');
  assert.equal(opens.length, 0, 'nothing opens before Continue');
});

test('Continue opens the tracked route in a new tab, the address unchanged and only the path of the page', async () => {
  const { dialog, opens } = await sheet({ ok: false });
  dialog.querySelector('#continue-provider').click();
  assert.equal(opens.length, 1);
  const [href, target, features] = opens[0];
  const url = new URL(href, 'https://tourguid.net');
  assert.equal(url.pathname, '/api/store/go');
  assert.equal(url.searchParams.get('url'), VIATOR);
  assert.equal(url.searchParams.get('page'), '/store/activities');
  assert.equal(target, '_blank');
  assert.equal(features, 'noopener');
  assert.equal(dialog.open, false);
  assert.equal(dialog.attrs['aria-labelledby'], undefined, 'the shared dialog is not left named');
});

test("a provider's bare home page names no item", async () => {
  const { lines } = await sheet({ ok: false, url: 'https://www.viator.com/' });
  assert.ok(!lines.includes('Seine cruise · Activity'));
  assert.ok(lines.includes('Continue to Viator'));
});

test('the registry names the provider; an unverified row still shows no facts', async () => {
  const { dialog, lines } = await sheet({ providers: [row({ name: 'Viator Experiences' })] });
  assert.ok(lines.includes('Continue to Viator Experiences'));
  assert.ok(lines.includes("Viator Experiences's own terms apply."));
  assert.equal(dialog.querySelector('dl'), null);
});

test('a verified provider shows labelled facts, never sentences of ours and never a badge', async () => {
  const { dialog, lines } = await sheet({ providers: [VERIFIED] });
  // Up to seven rows, in this order. Support is four separate rows, never one joined line, and nothing is shortened.
  assert.deepEqual(facts(dialog), {
    'Payment party': 'Viator Inc., merchant of record',
    Terms: 'www.viator.com/terms (version 2026-09)',
    'Cancellation & refunds': 'www.viator.com/cancel',
    'Support phone': '+1 555 0100',
    'Support email': 'help@viator.example',
    'Support page': 'www.viator.com/support',
    Address: '1 Main St, Anytown',
  });
  assert.deepEqual(Object.keys(facts(dialog)), ['Payment party', 'Terms', 'Cancellation & refunds', 'Support phone', 'Support email', 'Support page', 'Address']);
  assert.ok(!/verified/i.test(lines.join(' ')), 'no badge and no warning: the facts are the signal');
  const links = dialog.querySelector('dl').all().filter((node) => node.tag === 'a');
  assert.equal(links[0].href, 'https://www.viator.com/terms');
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.equal(links.find((a) => a.textContent === '+1 555 0100').href, 'tel:+15550100', 'a phone number can be tapped');
  assert.equal(links.find((a) => a.textContent === 'help@viator.example').href, 'mailto:help@viator.example');
  assert.ok(dialog.querySelector('#continue-provider'), 'a verified provider can be continued to');
});

test('"Funds received by" appears only when the recipient is not the payment party, straight after it', async () => {
  const differs = await sheet({ providers: [{ ...VERIFIED, fundsRecipient: 'Viator Settlement Services Ltd' }] });
  assert.deepEqual(Object.keys(facts(differs.dialog)).slice(0, 2), ['Payment party', 'Funds received by']);
  assert.equal(facts(differs.dialog)['Funds received by'], 'Viator Settlement Services Ltd');

  const same = await sheet({ providers: [{ ...VERIFIED, fundsRecipient: '  VIATOR INC.,   merchant of record ' }] });
  assert.equal(facts(same.dialog)['Funds received by'], undefined, 'the same entity is not printed twice');
});

test('an address that is not https is never linked, even from a row that claims to be verified', async () => {
  const { dialog } = await sheet({ providers: [{ ...VERIFIED, termsUrl: 'javascript:alert(1)', support: { url: 'http://x.example/', email: 'a@b.co?cc=x@y.example', phone: 'call me' } }] });
  const shown = facts(dialog);
  assert.equal(shown.Terms, undefined);
  assert.equal(shown['Support page'], undefined);
  assert.equal(shown['Support email'], undefined, 'a mailto with a query could add a cc or a body');
  assert.equal(shown['Support phone'], undefined);
  assert.equal(shown['Payment party'], 'Viator Inc., merchant of record');
});

test('hostile text from the registry stays text', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { dialog } = await sheet({ providers: [{ ...VERIFIED, paymentParty: evil, name: evil }] });
  assert.equal(facts(dialog)['Payment party'], evil);
  assert.equal(dialog.all().filter((node) => node.tag === 'img').length, 0);
});

test('the registry says no handoff for this provider: not available, no Continue', async () => {
  const { dialog, lines } = await sheet({ providers: [row({ handoffEnabled: false, name: 'Tiqets', hosts: ['viator.com'] })] });
  assert.deepEqual(lines, ['Not available yet', 'Tiqets is not available from TourGuid yet', 'You can keep planning your Journey in the meantime.', 'Close']);
  assert.equal(dialog.querySelector('#continue-provider'), null);
});

test('plan.require_verified_provider refuses an unverified or unknown provider, and lets a verified one through', async () => {
  const unknown = await sheet({ flags: [REQUIRE], ok: false });
  assert.deepEqual(unknown.lines, ['Not available yet', 'Viator is not available from TourGuid yet', 'TourGuid has not verified this provider yet. You can keep planning your Journey in the meantime.', 'Close']);
  assert.equal(unknown.dialog.querySelector('#continue-provider'), null);

  const unverified = await sheet({ flags: [REQUIRE], providers: [row()] });
  assert.equal(unverified.dialog.querySelector('#continue-provider'), null);

  const verified = await sheet({ flags: [REQUIRE], providers: [VERIFIED] });
  assert.ok(verified.dialog.querySelector('#continue-provider'));
  assert.ok(facts(verified.dialog));
});

test('a provider the registry disabled is refused without claiming anything about verification', async () => {
  const { lines } = await sheet({ flags: [REQUIRE], providers: [row({ handoffEnabled: false })] });
  assert.deepEqual(lines.slice(-2), ['You can keep planning your Journey in the meantime.', 'Close']);
});

test('the registry is asked once per page, and only when a sheet flag is on', async () => {
  const on = await sheet({ providers: [VERIFIED] });
  on.ctx.TourGuidJourney.handoffDialog(VIATOR, ITEM);
  on.ctx.TourGuidSupplier.bind({ setAttribute() {}, removeAttribute() {}, addEventListener() {}, style: {} }, VIATOR, { bookable: true });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(on.calls.length, 1);
  assert.equal(on.calls[0][0], '/api/store/providers');

  const off = page({ flags: [], providers: [VERIFIED] });
  off.ctx.TourGuidSupplier.bind({ setAttribute() {}, removeAttribute() {}, addEventListener() {}, style: {} }, VIATOR, { bookable: true });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(off.calls.length, 0, 'flags off: the registry is never asked');
});

test('the longest allowed domain wins, and a lookalike host matches nothing', async () => {
  const providers = [
    row({ key: 'duffel', name: 'Duffel', hosts: ['duffel.com'] }),
    row({ key: 'duffel_links', name: 'Duffel Links', hosts: ['links.duffel.com'], handoffEnabled: false }),
  ];
  // In both orders, so the answer cannot depend on which row the registry happens to list first.
  for (const rows of [providers, [...providers].reverse()]) {
    const { ctx } = await sheet({ providers: rows, wait: 5 });
    const nameOf = async (address) => (await ctx.TourGuidSupplier.record(address))?.name ?? null;
    assert.equal(await nameOf('https://links.duffel.com/x'), 'Duffel Links');
    assert.equal(await nameOf('https://api.duffel.com/x'), 'Duffel');
    assert.equal(await nameOf('https://evilduffel.com/x'), null);
    assert.equal(await nameOf('https://duffel.com.evil.example/x'), null);
    assert.equal(await nameOf('http://duffel.com/x'), null);
  }
});

test('a registry that never answers does not hold the sheet back for long', async () => {
  const started = Date.now();
  const { lines } = await sheet({ fetch: () => new Promise(() => {}), wait: 3000 });
  assert.ok(lines.includes('Continue to Viator'), 'the sheet appears with the host-derived name');
  assert.ok(Date.now() - started < 3500);
});
