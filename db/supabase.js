// Supabase REST API (PostgREST) client — replaces db/index.js's Hyperdrive
// connection for every Workers request. Plain HTTP (fetch), so it needs no
// Cloudflare binding and has none of Hyperdrive's query-count ceiling. Uses
// the service_role key, which bypasses Row Level Security entirely — the
// same trust model the old Drizzle/Hyperdrive setup had (every handler
// already does its own admin/auth checks before touching the DB; RLS was
// never the enforcement layer here).
import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabase(env) {
  if (_client) return _client;
  const url = env?.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required but missing from configuration.');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

const toSnake = (str) => str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (str) => str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// Converts only the TOP-LEVEL keys of a row object — e.g. insert/update
// payloads — from camelCase to snake_case column names. Must not recurse
// into JSONB column values (variants, homeSections, headerMenu, ...), whose
// own internal keys are opaque application data, not table columns.
export function toSnakeRow(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[toSnake(k)] = v;
  return out;
}

// Converts only the TOP-LEVEL keys of a returned row back to camelCase, for
// API responses the frontend already expects in that shape.
export function toCamelRow(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[toCamel(k)] = v;
  return out;
}

export function toCamelRows(arr) {
  return (arr || []).map(toCamelRow);
}

// Throws with the same shallow shape handlers already catch (err.message,
// err.code) so existing try/catch blocks across api/*.js keep working
// unchanged — Supabase's client returns { data, error } instead of
// throwing, so every call site wraps its error check with this.
export function throwIfError(error) {
  if (!error) return;
  const err = new Error(error.message || 'Database error');
  err.code = error.code;
  throw err;
}
