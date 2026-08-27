const encoder = new TextEncoder();
const MAX_CAPABILITY_SECONDS = 3600;
const OPERATION_BUCKET_SECONDS = 3600;
const FREE_PROFILE_DAILY_LIMIT = 80000;
const FREE_PROFILE_CLASS_A_LIMIT = 800000;
const FREE_PROFILE_CLASS_B_LIMIT = 8000000;
const ALLOWED_UPLOAD_HEADERS = new Set([
  'content-type',
  'x-amz-meta-xxhash',
]);

const cachedHmacKeys = new Map();

class GatewayError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function freeProfileLimit(value, ceiling) {
  if (value === undefined || value === null || value === '') return ceiling;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, ceiling);
}

function base64urlBytes(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function hmacKey(secret) {
  if (cachedHmacKeys.has(secret)) return cachedHmacKeys.get(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  cachedHmacKeys.set(secret, key);
  return key;
}

function validObjectKey(claims) {
  if (typeof claims.key !== 'string' || claims.key.includes('..') || claims.key.includes('\\')) {
    return false;
  }
  if (claims.op === 'get') return claims.key.startsWith('assets/');
  return claims.key.startsWith(`pending/${claims.sid}/`);
}

export async function verifyCapability(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof env.ASSET_WORKER_HMAC_SECRET !== 'string' || env.ASSET_WORKER_HMAC_SECRET.length < 32) {
    throw new GatewayError(503, 'Asset gateway is not configured');
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/v1\/assets\/([^/]+)$/);
  const capability = url.searchParams.get('cap');
  if (!match || !capability || capability.length > 4096) {
    throw new GatewayError(403, 'Invalid asset capability');
  }

  const parts = capability.split('.');
  if (parts.length !== 2) throw new GatewayError(403, 'Invalid asset capability');
  const [encodedPayload, encodedSignature] = parts;
  let signature;
  try {
    signature = base64urlBytes(encodedSignature);
  } catch {
    throw new GatewayError(403, 'Invalid asset capability');
  }
  const verificationSecrets = [
    env.ASSET_WORKER_HMAC_SECRET,
    env.ASSET_WORKER_HMAC_PREVIOUS_SECRET,
  ].filter(secret => typeof secret === 'string' && secret.length >= 32);
  let verified = false;
  for (const secret of verificationSecrets) {
    if (await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      signature,
      encoder.encode(encodedPayload),
    )) {
      verified = true;
      break;
    }
  }
  if (!verified) throw new GatewayError(403, 'Invalid asset capability');

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64urlBytes(encodedPayload)));
  } catch {
    throw new GatewayError(403, 'Invalid asset capability');
  }

  let requestedAsset;
  try {
    requestedAsset = decodeURIComponent(match[1]);
  } catch {
    throw new GatewayError(403, 'Invalid asset capability');
  }
  const expectedOperation = request.method === 'GET' ? 'get' : request.method === 'PUT' ? 'put' : '';
  if (
    claims?.v !== 1
    || claims.op !== expectedOperation
    || claims.asset !== requestedAsset
    || typeof claims.sid !== 'string'
    || typeof claims.uid !== 'number'
    || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.exp)
    || claims.iat > nowSeconds + 30
    || claims.exp <= nowSeconds
    || claims.exp - claims.iat > MAX_CAPABILITY_SECONDS
    || !validObjectKey(claims)
  ) {
    throw new GatewayError(403, 'Invalid or expired asset capability');
  }
  return claims;
}

function configuredOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  );
}

function requestOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (!configuredOrigins(env).has(origin)) throw new GatewayError(403, 'Origin is not allowed');
  return origin;
}

function responseHeaders(headers, origin) {
  const result = new Headers(headers);
  result.set('Cache-Control', 'private, max-age=60');
  result.set('X-Content-Type-Options', 'nosniff');
  if (origin) {
    result.set('Access-Control-Allow-Origin', origin);
    result.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Type, ETag, X-Asset-Cache',
    );
    result.append('Vary', 'Origin');
  }
  return result;
}

function errorResponse(error, origin = null) {
  const status = error instanceof GatewayError ? error.status : 500;
  const message = error instanceof GatewayError ? error.message : 'Asset gateway failure';
  return new Response(message, { status, headers: responseHeaders({}, origin) });
}

function preflight(request, env) {
  let origin = null;
  try {
    origin = requestOrigin(request, env);
    if (!origin) throw new GatewayError(403, 'Origin is required');
    const method = request.headers.get('Access-Control-Request-Method');
    if (!['GET', 'PUT'].includes(method)) throw new GatewayError(405, 'Method is not allowed');
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map(header => header.trim().toLowerCase())
      .filter(Boolean);
    if (requestedHeaders.some(header => !ALLOWED_UPLOAD_HEADERS.has(header))) {
      throw new GatewayError(403, 'Header is not allowed');
    }
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': [...ALLOWED_UPLOAD_HEADERS].join(', '),
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      },
    });
  } catch (error) {
    return errorResponse(error, origin);
  }
}

async function reserveBudget(env, kind, nonce, expires) {
  const id = env.ASSET_BUDGET.idFromName('global');
  const stub = env.ASSET_BUDGET.get(id);
  const response = await stub.fetch('https://asset-budget.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, nonce, expires }),
  });
  if (!response.ok) {
    console.warn(JSON.stringify({
      event: 'asset_gateway.budget.rejected',
      kind,
      status: response.status,
    }));
    throw new GatewayError(response.status, await response.text() || 'R2 operation budget exhausted');
  }
}

function observeRejection(request, response) {
  if (response.status >= 400) {
    console.warn(JSON.stringify({
      event: 'asset_gateway.request.rejected',
      method: request.method,
      status: response.status,
    }));
  }
  return response;
}

async function download(request, env, context, claims, origin) {
  if (request.headers.has('Range')) throw new GatewayError(416, 'Range requests are not supported');

  const requestUrl = new URL(request.url);
  requestUrl.pathname = `/__asset_cache/${encodeURIComponent(claims.key)}`;
  requestUrl.search = '';
  const cacheKey = new Request(requestUrl, { method: 'GET' });
  let cached;
  try {
    cached = await caches.default.match(cacheKey);
  } catch {
    cached = undefined;
  }
  if (cached) {
    const headers = responseHeaders(cached.headers, origin);
    headers.set('X-Asset-Cache', 'HIT');
    return new Response(cached.body, {
      status: cached.status,
      headers,
    });
  }

  await reserveBudget(env, 'download');
  const object = await env.ASSETS.get(claims.key);
  if (!object?.body) throw new GatewayError(404, 'Asset not found');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', `public, max-age=${positiveInteger(env.ASSET_CACHE_TTL_SECONDS, 86400)}`);
  const cacheResponse = new Response(object.body, { headers });
  context.waitUntil(
    caches.default.put(cacheKey, cacheResponse.clone()).catch(() => undefined),
  );
  const clientHeaders = responseHeaders(cacheResponse.headers, origin);
  clientHeaders.set('X-Asset-Cache', 'MISS');
  return new Response(cacheResponse.body, {
    status: 200,
    headers: clientHeaders,
  });
}

async function upload(request, env, claims, origin) {
  if (
    !Number.isSafeInteger(claims.size)
    || claims.size <= 0
    || typeof claims.type !== 'string'
    || typeof claims.hash !== 'string'
    || typeof claims.nonce !== 'string'
  ) {
    throw new GatewayError(403, 'Invalid upload capability');
  }
  const contentLength = Number(request.headers.get('Content-Length'));
  if (contentLength !== claims.size) throw new GatewayError(400, 'Upload size does not match capability');
  if (request.headers.get('Content-Type') !== claims.type) {
    throw new GatewayError(400, 'Upload content type does not match capability');
  }
  if (request.headers.get('x-amz-meta-xxhash') !== claims.hash) {
    throw new GatewayError(400, 'Upload hash metadata does not match capability');
  }
  if (!request.body) throw new GatewayError(400, 'Upload body is required');

  await reserveBudget(env, 'upload', claims.nonce, claims.exp);
  const object = await env.ASSETS.put(claims.key, request.body, {
    httpMetadata: { contentType: claims.type },
    customMetadata: { xxhash: claims.hash },
  });
  const headers = responseHeaders({}, origin);
  if (object?.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(null, { status: 201, headers });
}

export async function handleRequest(request, env, context) {
  if (request.method === 'OPTIONS') {
    return observeRejection(request, preflight(request, env));
  }
  let origin = null;
  try {
    origin = requestOrigin(request, env);
    if (!['GET', 'PUT'].includes(request.method)) throw new GatewayError(405, 'Method is not allowed');
    const claims = await verifyCapability(request, env);
    const response = request.method === 'GET'
      ? await download(request, env, context, claims, origin)
      : await upload(request, env, claims, origin);
    return observeRejection(request, response);
  } catch (error) {
    return observeRejection(request, errorResponse(error, origin));
  }
}

export class AssetBudget {
  constructor(context, env) {
    this.context = context;
    this.env = env;
    this.sql = context.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counters (scope TEXT PRIMARY KEY, used INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS used_nonces (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS operation_buckets '
        + '(created_hour INTEGER PRIMARY KEY, a_used INTEGER NOT NULL, b_used INTEGER NOT NULL)',
    );
    const legacyTable = [...this.sql.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'operation_reservations'",
    )];
    if (legacyTable.length > 0) {
      this.sql.exec(
        'INSERT INTO operation_buckets (created_hour, a_used, b_used) '
          + `SELECT (created / ${OPERATION_BUCKET_SECONDS}) * ${OPERATION_BUCKET_SECONDS}, `
          + 'SUM(a_used), SUM(b_used) FROM operation_reservations GROUP BY 1 '
          + 'ON CONFLICT(created_hour) DO UPDATE SET '
          + 'a_used = excluded.a_used, b_used = excluded.b_used',
      );
      this.sql.exec('DROP TABLE operation_reservations');
    }
  }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/reserve') {
      return new Response('Not found', { status: 404 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid reservation', { status: 400 });
    }
    if (!['download', 'upload'].includes(body.kind)) {
      return new Response('Invalid reservation', { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const rollingWindowStart = now - (30 * 24 * 60 * 60);
    const currentHour = Math.floor(now / OPERATION_BUCKET_SECONDS) * OPERATION_BUCKET_SECONDS;
    const currentDate = new Date(now * 1000);
    const dayStart = Math.floor(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
    ) / 1000);
    const dayLimit = freeProfileLimit(
      this.env.ASSET_R2_DAILY_LIMIT,
      FREE_PROFILE_DAILY_LIMIT,
    );
    const classALimit = freeProfileLimit(
      this.env.ASSET_CLASS_A_MONTHLY_LIMIT,
      FREE_PROFILE_CLASS_A_LIMIT,
    );
    const classBLimit = freeProfileLimit(
      this.env.ASSET_CLASS_B_MONTHLY_LIMIT,
      FREE_PROFILE_CLASS_B_LIMIT,
    );

    if (body.kind === 'upload') {
      if (typeof body.nonce !== 'string' || !Number.isSafeInteger(body.expires)) {
        return new Response('Upload nonce is required', { status: 400 });
      }
      this.sql.exec('DELETE FROM used_nonces WHERE expires <= ?', now);
      for (const _row of this.sql.exec('SELECT nonce FROM used_nonces WHERE nonce = ?', body.nonce)) {
        return new Response('Upload capability was already used', { status: 409 });
      }
    }

    // Retain a boundary bucket until its entire hour is outside the rolling
    // window. The resulting overcount is at most one hour and fails safely.
    this.sql.exec(
      'DELETE FROM operation_buckets WHERE created_hour + ? <= ?',
      OPERATION_BUCKET_SECONDS,
      rollingWindowStart,
    );
    const [rolling] = this.sql.exec(
      'SELECT COALESCE(SUM(a_used), 0) AS a_used, '
        + 'COALESCE(SUM(b_used), 0) AS b_used FROM operation_buckets',
    );
    const [today] = this.sql.exec(
      'SELECT COALESCE(SUM(a_used + b_used), 0) AS used '
        + 'FROM operation_buckets WHERE created_hour >= ?',
      dayStart,
    );

    // A completed upload performs the Worker PUT and the server-side promotion
    // copy (2 Class A), plus HEAD + GET verification and two promotion HEADs
    // (4 Class B). Reserve the entire successful lifecycle before accepting
    // bytes; abandoned uploads are deliberately overcounted to fail safely.
    const cost = body.kind === 'upload'
      ? { a: 2, b: 4 }
      : { a: 0, b: 1 };
    if (
      Number(today.used) + cost.a + cost.b > dayLimit
      || Number(rolling.a_used) + cost.a > classALimit
      || Number(rolling.b_used) + cost.b > classBLimit
    ) {
      return new Response('R2 operation budget exhausted', { status: 429 });
    }

    if (body.kind === 'upload') {
      this.sql.exec(
        'INSERT INTO used_nonces (nonce, expires) VALUES (?, ?)',
        body.nonce,
        body.expires,
      );
    }
    this.sql.exec(
      'INSERT INTO operation_buckets (created_hour, a_used, b_used) VALUES (?, ?, ?) '
        + 'ON CONFLICT(created_hour) DO UPDATE SET '
        + 'a_used = a_used + excluded.a_used, b_used = b_used + excluded.b_used',
      currentHour,
      cost.a,
      cost.b,
    );
    return new Response(null, { status: 204 });
  }
}

export default {
  fetch: handleRequest,
};
