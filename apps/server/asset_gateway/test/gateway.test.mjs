import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';

import { AssetBudget, handleRequest, verifyCapability } from '../src/index.mjs';

const SECRET = 'worker-secret-that-is-at-least-32-characters';
const encoder = new TextEncoder();

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function capability(claims, secret = SECRET) {
  const payload = base64url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return `${payload}.${base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))}`;
}

async function authorizedRequest(method, claims, init = {}) {
  const cap = await capability(claims);
  return new Request(`https://assets.example.com/v1/assets/${encodeURIComponent(claims.asset)}?cap=${cap}`, {
    ...init,
    method,
  });
}

function environment() {
  const reservations = [];
  const nonces = new Set();
  const objects = new Map();
  return {
    reservations,
    objects,
    env: {
      ALLOWED_ORIGINS: 'https://game.example.com',
      ASSET_WORKER_HMAC_SECRET: SECRET,
      ASSET_CACHE_TTL_SECONDS: '86400',
      ASSET_BUDGET: {
        idFromName: name => name,
        get: () => ({
          fetch: async (_url, init) => {
            const reservation = JSON.parse(init.body);
            reservations.push(reservation);
            if (reservation.nonce && nonces.has(reservation.nonce)) {
              return new Response('Upload capability was already used', { status: 409 });
            }
            if (reservation.nonce) nonces.add(reservation.nonce);
            return new Response(null, { status: 204 });
          },
        }),
      },
      ASSETS: {
        get: async key => objects.get(key) ?? null,
        put: async (key, body, options) => {
          objects.set(key, { body: await new Response(body).arrayBuffer(), options });
          return { httpEtag: '"uploaded"' };
        },
      },
    },
  };
}

let cacheEntries;

beforeEach(() => {
  cacheEntries = new Map();
  globalThis.caches = {
    default: {
      match: async request => cacheEntries.get(request.url)?.clone(),
      put: async (request, response) => cacheEntries.set(request.url, response.clone()),
    },
  };
});

afterEach(() => {
  delete globalThis.caches;
});

test('verifies a server-compatible HMAC capability', async () => {
  const claims = {
    asset: 'asset-1', exp: 1700000300, iat: 1700000000,
    key: 'assets/asset-1.png', op: 'get', sid: 'ROOM', uid: 7, v: 1,
  };
  const request = await authorizedRequest('GET', claims);

  assert.deepEqual(
    await verifyCapability(request, { ASSET_WORKER_HMAC_SECRET: SECRET }, 1700000001),
    claims,
  );
});

test('accepts the previous HMAC secret during a zero-downtime rotation', async () => {
  const previousSecret = 'previous-secret-that-is-at-least-32-characters';
  const claims = {
    asset: 'asset-1', exp: 1700000300, iat: 1700000000,
    key: 'assets/asset-1.png', op: 'get', sid: 'ROOM', uid: 7, v: 1,
  };
  const cap = await capability(claims, previousSecret);
  const request = new Request(
    `https://assets.example.com/v1/assets/asset-1?cap=${cap}`,
    { method: 'GET' },
  );

  assert.deepEqual(
    await verifyCapability(request, {
      ASSET_WORKER_HMAC_SECRET: SECRET,
      ASSET_WORKER_HMAC_PREVIOUS_SECRET: previousSecret,
    }, 1700000001),
    claims,
  );
});

test('rejects an expired capability before touching R2', async () => {
  const { env, reservations } = environment();
  const request = await authorizedRequest('GET', {
    asset: 'asset-1', exp: 1, iat: 0,
    key: 'assets/asset-1.png', op: 'get', sid: 'ROOM', uid: 7, v: 1,
  });

  const response = await handleRequest(request, env, { waitUntil() {} });

  assert.equal(response.status, 403);
  assert.equal(reservations.length, 0);
});

test('does not reflect a rejected preflight origin', async () => {
  const { env } = environment();
  const request = new Request('https://assets.example.com/v1/assets/asset-1', {
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Method': 'GET',
      Origin: 'https://attacker.example',
    },
  });

  const response = await handleRequest(request, env, { waitUntil() {} });

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('reserves one Class B operation on a cache miss and caches the object', async () => {
  const { env, objects, reservations } = environment();
  const body = new TextEncoder().encode('image');
  objects.set('assets/asset-1.png', {
    body,
    size: body.byteLength,
    httpEtag: '"asset"',
    writeHttpMetadata: headers => headers.set('Content-Type', 'image/png'),
  });
  const now = Math.floor(Date.now() / 1000);
  const request = await authorizedRequest('GET', {
    asset: 'asset-1', exp: now + 300, iat: now,
    key: 'assets/asset-1.png', op: 'get', sid: 'ROOM', uid: 7, v: 1,
  }, { headers: { Origin: 'https://game.example.com' } });
  const pending = [];

  const response = await handleRequest(request, env, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  const cachedResponse = await handleRequest(request, env, { waitUntil() {} });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'image');
  assert.equal(response.headers.get('X-Asset-Cache'), 'MISS');
  assert.equal(cachedResponse.status, 200);
  assert.equal(cachedResponse.headers.get('X-Asset-Cache'), 'HIT');
  assert.match(
    cachedResponse.headers.get('Access-Control-Expose-Headers'),
    /X-Asset-Cache/,
  );
  assert.deepEqual(reservations, [{ kind: 'download' }]);
});

test('accepts one exact upload and rejects nonce replay before a second R2 put', async () => {
  const { env, objects } = environment();
  const bytes = new TextEncoder().encode('image');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    asset: 'asset-1', exp: now + 900, hash: 'abcdef', iat: now,
    key: 'pending/ROOM/asset-1.png', nonce: 'one-use', op: 'put',
    sid: 'ROOM', size: bytes.byteLength, type: 'image/png', uid: 7, v: 1,
  };
  const headers = {
    'Content-Length': String(bytes.byteLength),
    'Content-Type': 'image/png',
    'Origin': 'https://game.example.com',
    'x-amz-meta-xxhash': 'abcdef',
  };

  const first = await handleRequest(
    await authorizedRequest('PUT', claims, { body: bytes, headers }),
    env,
    { waitUntil() {} },
  );
  const replay = await handleRequest(
    await authorizedRequest('PUT', claims, { body: bytes, headers }),
    env,
    { waitUntil() {} },
  );

  assert.equal(first.status, 201);
  assert.equal(replay.status, 409);
  assert.equal(objects.size, 1);
});

test('durable budget reserves the complete lifecycle and enforces rolling limits', async () => {
  const database = new DatabaseSync(':memory:');
  const sql = {
    exec(statement, ...bindings) {
      const prepared = database.prepare(statement);
      return statement.trimStart().startsWith('SELECT')
        ? prepared.all(...bindings)
        : (prepared.run(...bindings), []);
    },
  };
  const budget = new AssetBudget(
    { storage: { sql } },
    {
      ASSET_CLASS_A_MONTHLY_LIMIT: '2',
      ASSET_CLASS_B_MONTHLY_LIMIT: '5',
      ASSET_R2_DAILY_LIMIT: '10',
    },
  );
  const reserve = body => budget.fetch(new Request('https://budget.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const expires = Math.floor(Date.now() / 1000) + 900;

  assert.equal((await reserve({ kind: 'upload', nonce: 'nonce-1', expires })).status, 204);
  assert.equal((await reserve({ kind: 'upload', nonce: 'nonce-1', expires })).status, 409);
  assert.equal((await reserve({ kind: 'download' })).status, 204);
  assert.equal((await reserve({ kind: 'download' })).status, 429);
  const [usage] = sql.exec(
    'SELECT SUM(a_used) AS a_used, SUM(b_used) AS b_used FROM operation_buckets',
  );
  assert.equal(usage.a_used, 2);
  assert.equal(usage.b_used, 5);
  const [bucketCount] = sql.exec('SELECT COUNT(*) AS count FROM operation_buckets');
  assert.equal(bucketCount.count, 1);

  database.close();
});

test('durable budget releases reservations after the rolling 30-day window', async () => {
  const database = new DatabaseSync(':memory:');
  const sql = {
    exec(statement, ...bindings) {
      const prepared = database.prepare(statement);
      return statement.trimStart().startsWith('SELECT')
        ? prepared.all(...bindings)
        : (prepared.run(...bindings), []);
    },
  };
  const budget = new AssetBudget(
    { storage: { sql } },
    {
      ASSET_CLASS_A_MONTHLY_LIMIT: '10',
      ASSET_CLASS_B_MONTHLY_LIMIT: '1',
      ASSET_R2_DAILY_LIMIT: '10',
    },
  );
  const reserve = () => budget.fetch(new Request('https://budget.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'download' }),
  }));
  const originalNow = Date.now;
  const initialTime = Date.UTC(2026, 0, 15);

  try {
    Date.now = () => initialTime;
    assert.equal((await reserve()).status, 204);
    assert.equal((await reserve()).status, 429);

    Date.now = () => initialTime + (30 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000);
    assert.equal((await reserve()).status, 204);
  } finally {
    Date.now = originalNow;
    database.close();
  }
});

test('durable budget migrates per-operation reservations into hourly buckets', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(
    'CREATE TABLE operation_reservations '
      + '(created INTEGER NOT NULL, a_used INTEGER NOT NULL, b_used INTEGER NOT NULL); '
      + 'INSERT INTO operation_reservations VALUES (3601, 2, 4), (3610, 0, 1), (7200, 0, 1);',
  );
  const sql = {
    exec(statement, ...bindings) {
      const prepared = database.prepare(statement);
      return statement.trimStart().startsWith('SELECT')
        ? prepared.all(...bindings)
        : (prepared.run(...bindings), []);
    },
  };

  new AssetBudget({ storage: { sql } }, {});

  assert.deepEqual(
    sql.exec('SELECT * FROM operation_buckets ORDER BY created_hour').map(row => ({ ...row })),
    [
      { created_hour: 3600, a_used: 2, b_used: 5 },
      { created_hour: 7200, a_used: 0, b_used: 1 },
    ],
  );
  assert.deepEqual(
    sql.exec("SELECT name FROM sqlite_master WHERE name = 'operation_reservations'"),
    [],
  );
  database.close();
});
