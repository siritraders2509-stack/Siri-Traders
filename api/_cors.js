// Matches the production domain (with or without "www."), FRONTEND_URL
// (kept as an override/extra), any Cloudflare Pages preview URL for this
// project (*.siri-traders-app.pages.dev — used while testing deployments
// before DNS pointed at the real domain), and localhost for dev.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin.startsWith('http://localhost:')) return true;
  if (origin === process.env.FRONTEND_URL) return true;
  if (/^https:\/\/(www\.)?siritrader\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.siri-traders-app\.pages\.dev$/.test(origin)) return true;
  return false;
}

export function setCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin;
  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';

  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin(requestOrigin) ? requestOrigin : allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-secret');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
