// Wraps a Vercel-style `handler(req, res)` (as every api/*.js file already
// is) into a Cloudflare Pages Function `onRequest(context)`, so that
// business logic written for Vercel's Node.js runtime can run unchanged on
// Workers. See the migration plan for why this exists instead of a rewrite
// of every handler.
//
// Note: neither the Supabase client (db/supabase.js) nor Clerk's client
// (api/_clerkAuth.js) need any per-request setup here — both are plain
// fetch()-based HTTP clients built lazily on first use, reading
// process.env (already bridged below). Unlike the old Hyperdrive/Postgres
// setup, there's no raw socket to open or close per request.

const JSON_TYPE = 'application/json';
const FORM_TYPE = 'application/x-www-form-urlencoded';

function headersToObject(headers) {
  const obj = {};
  for (const [key, value] of headers.entries()) obj[key] = value;
  return obj;
}

async function buildReq(request, env, query) {
  const method = request.method;
  const headers = headersToObject(request.headers);
  const contentType = headers['content-type'] || '';

  let body;
  let rawBody;
  if (method !== 'GET' && method !== 'HEAD') {
    if (contentType.includes(JSON_TYPE)) {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } else if (contentType.includes(FORM_TYPE)) {
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      // Non-JSON/non-form body (e.g. an image upload) — handlers that need
      // this (api/upload.js) read req.rawBody themselves instead of req.body.
      rawBody = await request.arrayBuffer();
    }
  }

  return { method, headers, query, body, rawBody };
}

function createRes() {
  const state = { statusCode: 200, headers: new Headers(), body: null, ended: false };
  const res = {
    status(code) { state.statusCode = code; return res; },
    setHeader(key, value) {
      if (key.toLowerCase() === 'set-cookie') state.headers.append(key, value);
      else state.headers.set(key, value);
      return res;
    },
    json(obj) {
      state.headers.set('Content-Type', JSON_TYPE);
      state.body = JSON.stringify(obj);
      state.ended = true;
      return res;
    },
    send(data) {
      if (typeof data === 'object' && data !== null) return res.json(data);
      state.body = data == null ? '' : String(data);
      state.ended = true;
      return res;
    },
    end(data) {
      if (data !== undefined) state.body = data;
      state.ended = true;
      return res;
    },
  };
  return { res, state };
}

// Defensive bridge so every handler's existing `process.env.X` reads keep
// working regardless of whether Cloudflare's own nodejs_compat process.env
// population is active — copies this request's plain string bindings
// (secrets/vars) onto a global `process.env`.
function bridgeProcessEnv(env) {
  if (typeof globalThis.process === 'undefined') globalThis.process = { env: {} };
  if (!globalThis.process.env) globalThis.process.env = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') globalThis.process.env[key] = value;
  }
}

export function adaptHandler(vercelHandler) {
  return async (context) => {
    const { request, env } = context;

    bridgeProcessEnv(env);

    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams.entries());
    if (context.params) {
      for (const [k, v] of Object.entries(context.params)) {
        query[k] = Array.isArray(v) ? v[v.length - 1] : v;
      }
    }

    const req = await buildReq(request, env, query);
    const { res, state } = createRes();

    await vercelHandler(req, res);

    return new Response(state.ended ? state.body : null, {
      status: state.statusCode,
      headers: state.headers,
    });
  };
}

// For handlers that need to inject a fixed resource/action into req.query
// before dispatching into another file's router logic — recreates what
// vercel.json's rewrites used to do (e.g. /api/admin/broadcast ->
// api/admin/orders.js with ?resource=broadcast).
export function adaptHandlerWithQuery(vercelHandler, extraQuery) {
  const wrapped = adaptHandler(vercelHandler);
  return async (context) => {
    const url = new URL(context.request.url);
    for (const [k, v] of Object.entries(extraQuery)) url.searchParams.set(k, v);
    const patchedRequest = new Request(url, context.request);
    return wrapped({ ...context, request: patchedRequest });
  };
}
