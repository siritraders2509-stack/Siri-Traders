/**
 * _adminSession.js — httpOnly cookie session for the real admin login.
 *
 * Signs/verifies a short JWT stored in an httpOnly cookie so the browser
 * never has to hold (or expose in its JS bundle) any admin credential.
 */

import jwt from 'jsonwebtoken';
import cookie from 'cookie';

const COOKIE_NAME = 'siri_admin_session';
const SESSION_TTL = '7d';

function secret() {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s) throw new Error('ADMIN_JWT_SECRET environment variable is required but missing');
  return s;
}

export function signAdminSession(payload) {
  return jwt.sign(payload, secret(), { expiresIn: SESSION_TTL });
}

export function verifyAdminSession(token) {
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  return verifyAdminSession(token);
}

// Secure cookies require the browser's own connection to be HTTPS. When a
// request reaches this function via a local dev proxy (Vite -> production),
// the browser's connection to Vite is plain HTTP even though Vite's proxy
// talks to us over HTTPS — x-forwarded-proto reflects that original hop.
// Cloudflare (like Vercel) always sets this header and always terminates
// TLS itself, so trusting it alone (defaulting true when absent) covers
// every real deployment; only a raw local HTTP request would see false.
function clientUsedHttps(req) {
  const proto = req.headers['x-forwarded-proto'];
  if (proto) return proto.split(',')[0].trim() === 'https';
  return true;
}

export function setSessionCookie(req, res, token) {
  const serialized = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: clientUsedHttps(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });
  res.setHeader('Set-Cookie', serialized);
}

export function clearSessionCookie(req, res) {
  const serialized = cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: clientUsedHttps(req),
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  res.setHeader('Set-Cookie', serialized);
}
