/**
 * _clerkAuth.js — verify a Clerk session token on Vercel's Node.js runtime.
 *
 * Uses Clerk's verifyToken() with the correct jwtKey option so it can
 * verify the JWT signature without needing to call out to Clerk's JWKS endpoint
 * (which requires the publishable key). We pass both secretKey and the
 * issuer so the SDK knows where to fetch the JWKS keys from.
 */

import { createClerkClient, verifyToken } from '@clerk/backend';

function keys() {
  return {
    secretKey: process.env.CLERK_SECRET_KEY,
    // Clerk publishable key - may be set under either name
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      'pk_test_bmV4dC1sb25naG9ybi00Ny5jbGVyay5hY2NvdW50cy5kZXYk',
  };
}

// Built lazily (on first use within a request), not at module load — on
// Workers, env vars/secrets only exist once a request is being handled, so
// reading process.env at module scope (as this used to) would see nothing.
let _clerk = null;
function realClerk() {
  if (!_clerk) _clerk = createClerkClient(keys());
  return _clerk;
}

// Stable, importable singleton — call sites keep doing `clerk.users.getUser(...)`
// unchanged; this forwards to the real client once it's been built.
export const clerk = new Proxy(/** @type {any} */ ({}), {
  get(_target, prop) {
    return realClerk()[prop];
  }
});

export async function getAuthenticatedUserId(req) {
  const { secretKey, publishableKey } = keys();
  if (!secretKey) {
    console.error('getAuthenticatedUserId: CLERK_SECRET_KEY is not set');
    return null;
  }

  // Extract the Bearer token from the Authorization header
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    console.error('getAuthenticatedUserId: no Bearer token on request');
    return null;
  }

  try {
    // Use verifyToken with the publishable key as the issuer so Clerk SDK
    // can fetch JWKS and verify the signature
    const payload = await verifyToken(token, {
      secretKey,
      publishableKey,
    });

    if (!payload || !payload.sub) {
      console.error('getAuthenticatedUserId: verifyToken returned no payload');
      return null;
    }

    return payload.sub;
  } catch (err) {
    console.error('getAuthenticatedUserId: verifyToken threw', err?.message);
    return null;
  }
}
