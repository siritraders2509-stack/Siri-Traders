import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Supabase Storage upload (same Supabase project already used for the
// database — free tier, no credit card required, unlike Cloudflare R2).
// Runs through the same Node-compat adapter as every other handler here
// (see functions/api/upload.js) — the adapter detects non-JSON/non-form
// bodies (like this route's image upload) and hands them over as
// `req.rawBody` (ArrayBuffer) instead of trying to JSON-parse them.
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminOk = await isAdminRequest(req);
  if (!adminOk) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  const filename = String(req.query.filename || '').trim();
  if (!filename) {
    return res.status(400).json({ error: 'filename query param is required' });
  }

  const buffer = req.rawBody;
  if (!buffer || !buffer.byteLength) {
    return res.status(400).json({ error: 'Empty file' });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return res.status(413).json({ error: 'Image is too large (max 8MB).' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
  if (!supabaseUrl || !serviceKey) {
    console.error('Error in /api/upload: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }

  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  const key = `${crypto.randomUUID()}${ext}`;

  try {
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': contentType,
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text().catch(() => '');
      console.error(`Error in /api/upload: Supabase Storage returned ${uploadRes.status}:`, errBody);
      return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
    }

    return res.status(200).json({ url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}` });
  } catch (error) {
    console.error('Error in /api/upload:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
