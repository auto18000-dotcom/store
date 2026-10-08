// /api/store/go (src/store-worker.js): where an outbound click may land.
// TourGuid-Security measured two findings against the live site on 2026-10-08, both the same root cause (the allow-list admitted more than it was written to admit):
//   1. www.google.com was admitted whole, so /api/store/go?url=https://www.google.com/url?q=https://evil.example.com/ was a 302 to Google's own forwarder: the first link of a chain whose second link is Google's policy.
//   2. The host table was a plain object, so the hostnames "constructor" and "__proto__" were suppliers (no dot, so nobody can register them: not exploitable, but a lookup that answers for keys nobody put in it).
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/store-worker.js';

/** What /api/store/go does with a link, with store-search not configured (so nothing is recorded and nothing is fetched). */
async function go(target) {
  const response = await worker.fetch(new Request(`https://tourguid.net/api/store/go?url=${encodeURIComponent(target)}&page=%2Fstore`), {}, { waitUntil() {} });
  return { status: response.status, location: response.headers.get('location'), body: response.status === 400 ? await response.json() : null };
}

test('the suppliers we hand off to still go through, to exactly the address they were given', async () => {
  const links = [
    'https://www.viator.com/tours/Paris/Seine-Cruise/d479-5100SEINE?pid=P00012345&mcid=42383&medium=link',
    'https://viator.com/tours/Paris',
    'https://www.getyourguide.com/paris-l16/seine-cruise-t12345/?partner_id=ABC',
    'https://www.opentable.com/r/le-pavillon-paris',
    'https://www.expedia.com/Hotel-Search?destination=Paris',
    'https://links.duffel.com/a/abc',
    'https://duffel.com/',
  ];
  for (const link of links) assert.deepEqual(await go(link), { status: 302, location: link, body: null }, link);
});

test('Google is let through for Maps and for nothing else: a Maps link goes, the /url forwarder and the rest of Google do not', async () => {
  const maps = [
    'https://www.google.com/maps',
    'https://www.google.com/maps/',
    'https://www.google.com/maps/place/Eiffel+Tower',
    'https://www.google.com/maps/search/?api=1&query=Paris',
    'https://maps.google.com/?q=Paris',
    'https://maps.google.com/maps?q=Paris',
    'https://maps.google.com/maps/place/x',
  ];
  for (const link of maps) assert.deepEqual(await go(link), { status: 302, location: link, body: null }, link);

  const refused = [
    'https://www.google.com/url?q=https://evil.example.com/',              // the finding: Google's own forwarder
    'https://www.google.com/url?sa=t&url=https%3A%2F%2Fevil.example.com%2F',
    'https://www.google.com/search?q=viator',
    'https://www.google.com/',
    'https://www.google.com/mapsfoo',                                        // a path is a whole segment
    'https://www.google.com/maps../url?q=https://evil.example.com/',
    'https://www.google.com/maps/../url?q=https://evil.example.com/',        // dot segments: the parser reads this as /url
    'https://www.google.com/maps/%2e%2e/url?q=https://evil.example.com/',    // and so it does this
    'https://www.google.com/maps%2f..%2furl?q=x',                            // an encoded slash is not a segment boundary the parser knows, the server may
    'https://www.google.com/maps/x%2f..%2f..%2furl?q=x',
    'https://www.google.com/maps/x%2F..%2F..%2Furl?q=x',
    'https://www.google.com/maps/x%5c..%5curl?q=x',
    'https://maps.google.com/url?q=https://evil.example.com/',
    'https://maps.google.com/search?q=x',
    'https://maps.google.com/mapsfoo',
    'https://docs.google.com/maps/',                                         // another Google host was never on the list
    'https://google.com/maps/',
    'https://www.google.com.evil.example/maps/',
    'https://evil.example/www.google.com/maps/',
  ];
  for (const link of refused) assert.deepEqual(await go(link), { status: 400, location: null, body: { error: 'not_a_supplier', message: 'That link is not one we hand off to.' } }, link);
});

test('a name that happens to be a property of every object is not a supplier', async () => {
  for (const host of ['constructor', '__proto__', 'tostring', 'valueof', 'hasownproperty', 'isprototypeof', '__definegetter__']) {
    const answer = await go(`https://${host}/`);
    assert.equal(answer.status, 400, host);
    assert.equal(answer.location, null, host);
  }
});

test('the lookups answer with a supplier name or with nothing: they have no prototype to answer from', async () => {
  const source = (await import('node:fs')).readFileSync(new URL('../src/store-worker.js', import.meta.url), 'utf8');
  for (const table of ['SUPPLIER_HOSTS', 'SUPPLIER_PATHS', 'LEDGER_PROVIDERS']) {
    assert.match(source, new RegExp(`const ${table} = Object\\.assign\\(Object\\.create\\(null\\), \\{`), `${table} is built on a null prototype`);
  }
  assert.match(source, /if \(typeof supplier !== "string"\) return null;/, 'and a lookup that is not a name is nothing');
});

test('the userinfo, backslash and scheme tricks are still refused (the three places an open redirect usually comes from)', async () => {
  for (const link of [
    'https://www.viator.com@evil.example/',
    'https://user:pass@www.viator.com/',
    'https://www.viator.com\\@evil.example/',
    'http://www.viator.com/tours/x',
    'javascript:alert(1)',
    '//www.viator.com/tours/x',
    '',
  ]) assert.equal((await go(link)).status, 400, link);
});
