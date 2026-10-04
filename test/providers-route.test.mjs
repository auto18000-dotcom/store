// /api/store/providers (src/store-worker.js): the registry as the page may see it. And the /go log line.
//   node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/store-worker.js';

const ENV = { STORE_SEARCH_URL: 'https://search.example/functions/v1/store-search', STORE_CALLER_SECRET: 'shh' };

/** A fake edge cache and a fake store-search; restores both afterwards. */
async function withBackend(backend, body) {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  const store = new Map();
  const puts = [];
  const pending = [];
  globalThis.caches = {
    default: {
      match: async (request) => store.get(request.url)?.clone(),
      put: async (request, response) => { puts.push(request.url); store.set(request.url, response); },
    },
  };
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return backend(url, init); };
  try {
    const ask = async (path = '/api/store/providers', init, env = ENV) => {
      const response = await worker.fetch(new Request(`https://tourguid.net${path}`, init), env, { waitUntil: (p) => pending.push(p) });
      await Promise.all(pending);
      return response;
    };
    return await body({ ask, calls, puts });
  } finally {
    globalThis.fetch = realFetch;
    globalThis.caches = realCaches;
  }
}

const ok = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
const VERIFIED_ROW = {
  provider_key: 'viator',
  display_name: 'Viator',
  logo_asset: 'viator.svg',
  transaction_model: 'external_link',
  handoff_enabled: true,
  may_display_price: false,
  allowed_hosts: ['Viator.com', 'bad host', 'www.viator.com'],
  verification_state: 'verified',
  legal_name: 'Viator, Inc.',
  payment_party_label: 'Viator Inc., merchant of record',
  support_phone: '+1 555 0100',
  support_email: 'help@viator.example',
  support_address: '1 Main St, Anytown',
  support_url: 'https://www.viator.com/support',
  terms_url: 'https://www.viator.com/terms',
  cancellation_url: 'https://www.viator.com/cancel',
  terms_version: '2026-09',
};

test('asks store-search for transaction_providers with the caller secret and nothing else', async () => {
  await withBackend(async () => ok({ providers: [] }), async ({ ask, calls }) => {
    await ask();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ENV.STORE_SEARCH_URL);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['x-store-caller'], 'shh');
    assert.deepEqual(JSON.parse(calls[0].init.body), { provider: 'transaction_providers' });
  });
});

test('a verified row gives the page its display, routing and verified facts, and nothing else', async () => {
  await withBackend(async () => ok({ providers: [VERIFIED_ROW] }), async ({ ask }) => {
    const answer = await (await ask()).json();
    assert.deepEqual(answer.providers, [{
      key: 'viator',
      name: 'Viator',
      handoffEnabled: true,
      hosts: ['viator.com', 'www.viator.com'],
      verified: true,
      paymentParty: 'Viator Inc., merchant of record',
      termsUrl: 'https://www.viator.com/terms',
      cancellationUrl: 'https://www.viator.com/cancel',
      termsVersion: '2026-09',
      support: { url: 'https://www.viator.com/support', email: 'help@viator.example', phone: '+1 555 0100', address: '1 Main St, Anytown' },
    }]);
    const text = JSON.stringify(answer);
    for (const kept of ['Viator, Inc.', 'viator.svg', 'external_link', 'may_display_price']) assert.ok(!text.includes(kept), `${kept} must not reach the page`);
  });
});

test('an unverified row never carries the facts, even if the backend sent them', async () => {
  await withBackend(async () => ok({ providers: [{ ...VERIFIED_ROW, verification_state: 'unverified' }] }), async ({ ask }) => {
    const [provider] = (await (await ask()).json()).providers;
    assert.deepEqual(provider, { key: 'viator', name: 'Viator', handoffEnabled: true, hosts: ['viator.com', 'www.viator.com'], verified: false });
  });
});

test('a row that says verified without the facts the database requires is not trusted as verified', async () => {
  for (const missing of ['payment_party_label', 'terms_url', 'cancellation_url']) {
    await withBackend(async () => ok({ providers: [{ ...VERIFIED_ROW, [missing]: null }] }), async ({ ask }) => {
      const [provider] = (await (await ask()).json()).providers;
      assert.equal(provider.verified, false, missing);
      assert.equal(provider.paymentParty, undefined, missing);
    });
  }
});

test('addresses that are not https, and anything too long or malformed, are dropped rather than repaired', async () => {
  const row = { ...VERIFIED_ROW, support_url: 'http://x.example/', support_email: 'a@b.co?cc=x@y.example', support_phone: 'call me', support_address: 'x'.repeat(301), terms_version: 'v'.repeat(41) };
  await withBackend(async () => ok({ providers: [row] }), async ({ ask }) => {
    const [provider] = (await (await ask()).json()).providers;
    assert.equal(provider.verified, true);
    assert.equal(provider.support, undefined);
    assert.equal(provider.termsVersion, undefined);
  });
  const hostile = { ...VERIFIED_ROW, terms_url: 'javascript:alert(1)' };
  await withBackend(async () => ok({ providers: [hostile] }), async ({ ask }) => {
    assert.equal((await (await ask()).json()).providers[0].verified, false);
  });
});

test('rows without a usable key or name are left out; handoff is off unless the registry says exactly true', async () => {
  const rows = [{ provider_key: 'Bad Key!', display_name: 'X' }, { provider_key: 'ok', display_name: '' }, null, 'x', { provider_key: 'tiqets', display_name: 'Tiqets', handoff_enabled: 'true', allowed_hosts: ['tiqets.com'] }];
  await withBackend(async () => ok({ providers: rows }), async ({ ask }) => {
    const { providers } = await (await ask()).json();
    assert.deepEqual(providers, [{ key: 'tiqets', name: 'Tiqets', handoffEnabled: false, hosts: ['tiqets.com'], verified: false }]);
  });
});

test('the answer is cached at the edge; an empty registry is not', async () => {
  await withBackend(async () => ok({ providers: [VERIFIED_ROW] }), async ({ ask, calls, puts }) => {
    const first = await ask();
    assert.equal(first.headers.get('cache-control'), 'public, max-age=60');
    assert.equal(puts.length, 1);
    const second = await (await ask()).json();
    assert.equal(second.cached, true);
    assert.equal(calls.length, 1, 'the second ask never reached store-search');
  });
  await withBackend(async () => ok({ providers: [] }), async ({ ask, puts }) => {
    const response = await ask();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(puts.length, 0);
  });
});

test('a tier without the registry, or any failure, is a non-200 the page reads as "no registry"', async () => {
  const failures = [
    [async () => new Response(JSON.stringify({ error: 'unknown' }), { status: 404 }), 404],
    [async () => new Response('{}', { status: 503 }), 503],
    [async () => { throw new Error('network'); }, 502],
    [async () => new Response('not json', { status: 200 }), 502],
  ];
  for (const [backend, status] of failures) {
    await withBackend(backend, async ({ ask }) => {
      const response = await ask();
      assert.equal(response.status, status);
      assert.ok(!response.ok);
    });
  }
  await withBackend(async () => ok({}), async ({ ask }) => {
    assert.equal((await ask('/api/store/providers', undefined, {})).status, 503, 'store-search not configured');
  });
});

test('only a GET reads the registry', async () => {
  await withBackend(async () => ok({ providers: [] }), async ({ ask }) => {
    assert.equal((await ask('/api/store/providers', { method: 'POST' })).status, 405);
  });
});

test('a click through /go says in the Worker log whether it was recorded, and keeps everything else out', async () => {
  const lines = [];
  const realLog = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    await withBackend(async () => ok({}), async ({ ask }) => {
      const response = await ask('/api/store/go?url=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FEiffel%2BTower&page=%2Fstore%2Factivities', undefined, {});
      assert.equal(response.status, 302);
    });
  } finally {
    console.log = realLog;
  }
  const line = lines.find((entry) => entry.startsWith('[store] go '));
  assert.match(line, /^\[store\] go status=302 ms=\d+ referral=not-recorded$/);
  assert.ok(!line.includes('google') && !line.includes('Eiffel'), 'the destination is not logged');
});
