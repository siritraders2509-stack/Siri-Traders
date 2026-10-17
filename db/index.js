import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'node:async_hooks';

import { products } from './schema/products.js';
import { categories } from './schema/categories.js';
import { orders } from './schema/orders.js';
import { orderItems } from './schema/order_items.js';
import { users } from './schema/users.js';
import { offers } from './schema/offers.js';
import { coupons } from './schema/coupons.js';
import { deliveryZones } from './schema/delivery_zones.js';
import { adminUsers } from './schema/admin_users.js';
import { settings } from './schema/settings.js';
import { inventory } from './schema/inventory.js';
import { inventoryLogs } from './schema/inventory_logs.js';
import { reviews } from './schema/reviews.js';
import { cmsBanners } from './schema/cms_banners.js';
import { cmsPages } from './schema/cms_pages.js';
import { cmsFaqs } from './schema/cms_faqs.js';
import { cmsBlogs } from './schema/cms_blogs.js';
import { seoRedirects } from './schema/seo_redirects.js';

// Load .env.local first (local dev), fall back to .env — no-op on Workers,
// where env vars never come from files (see configureDb below instead).
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const schema = {
  products,
  categories,
  orders,
  orderItems,
  users,
  offers,
  coupons,
  deliveryZones,
  adminUsers,
  settings,
  inventory,
  inventoryLogs,
  reviews,
  cmsBanners,
  cmsPages,
  cmsFaqs,
  cmsBlogs,
  seoRedirects
};

// IMPORTANT (Workers-specific): a Postgres connection — and the sockets or
// streams underneath it — belongs to the request that created it. Workers
// hard-forbids touching one request's I/O from a different request, even
// on the same warm isolate ("Cannot perform I/O on behalf of a different
// request"), so the client CANNOT be cached and reused across requests like
// a normal long-lived Node server would. Instead, a fresh lightweight
// connection to Hyperdrive is opened per request — cheap, since Hyperdrive
// pools the real connections to Supabase on its side — and `db` resolves to
// *that* connection only for the lifetime of the request, via
// AsyncLocalStorage (so concurrent requests on one isolate never cross
// wires). This file deliberately has NO top-level await — even one gated by
// a runtime check breaks Wrangler's esbuild bundling for Pages Functions.

// The one-time `products.sibling_group` column check that used to run here
// on every request (guarded by an in-memory flag that only helped within a
// single warm isolate — Workers' frequent isolate churn meant it kept
// re-running) has long since applied in production. Since configureDb()
// runs on literally every request, this was a significant contributor to
// exhausting the daily Hyperdrive quota. Removed.

// Builds a fresh { client, instance } pair. `client` must be closed by the
// caller once the request/script is done with it (e.g. via
// `context.waitUntil(client.end())` in a Pages Function, so closing doesn't
// delay the response).
export async function configureDb(env) {
  const connectionString = env?.HYPERDRIVE?.connectionString || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL (or a HYPERDRIVE binding) is required but missing from configuration.');
  }

  // max: 1 — this client lives for exactly one request, so it never needs
  // its own internal pool; fetch_types: false skips an extra round-trip
  // postgres.js otherwise makes on every new connection to introspect
  // custom types, which adds up when a fresh connection is opened per
  // request (per Cloudflare's documented Hyperdrive + postgres.js pattern).
  const client = postgres(connectionString, { prepare: false, max: 1, fetch_types: false });
  const instance = drizzle(client, { schema });
  return { client, instance };
}

const dbStorage = new AsyncLocalStorage();

// Runs `fn` with `db` (below) resolving to `instance` for the duration of
// the call — and everything it awaits — isolated from any other concurrent
// request on the same isolate. Used by functions/_lib/adapter.js.
export function withDb(instance, fn) {
  return dbStorage.run(instance, fn);
}

// Plain Node (local scripts, seeding): a single client for the whole
// process's lifetime is fine — there's no concurrent-request isolation
// concern outside Workers — so set the context once via enterWith() instead
// of wrapping the whole script in a withDb() callback. Call this once at
// the top of a script, before using `db`.
export async function configureDbForNode() {
  const { client, instance } = await configureDb();
  dbStorage.enterWith(instance);
  return { client, instance };
}

// Stable, importable singleton — every api/*.js file keeps doing
// `import { db } from '../db/index.js'` and `db.select()...` unchanged.
// Resolves to whichever instance is active for the current request/script
// (see withDb / configureDbForNode above).
export const db = new Proxy(/** @type {any} */ ({}), {
  get(_target, prop) {
    const instance = dbStorage.getStore();
    if (!instance) {
      throw new Error('db used outside of a request/script context — call withDb() (Workers) or configureDbForNode() (Node) first.');
    }
    return instance[prop];
  }
});

// Export everything from schemas for clean single-entry imports
export { products } from './schema/products.js';
export { categories } from './schema/categories.js';
export { orders } from './schema/orders.js';
export { orderItems } from './schema/order_items.js';
export { users } from './schema/users.js';
export { offers } from './schema/offers.js';
export { coupons } from './schema/coupons.js';
export { deliveryZones } from './schema/delivery_zones.js';
export { adminUsers } from './schema/admin_users.js';
export { settings } from './schema/settings.js';
export { inventory } from './schema/inventory.js';
export { inventoryLogs } from './schema/inventory_logs.js';
export { reviews } from './schema/reviews.js';
export { cmsBanners } from './schema/cms_banners.js';
export { cmsPages } from './schema/cms_pages.js';
export { cmsFaqs } from './schema/cms_faqs.js';
export { cmsBlogs } from './schema/cms_blogs.js';
export { seoRedirects } from './schema/seo_redirects.js';
