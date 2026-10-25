import { getSupabase, toCamelRows, throwIfError } from '../../db/supabase.js';
import { setCorsHeaders } from '../_cors.js';
import { isAdminRequest } from '../_adminAuth.js';

// Called by other admin handlers right before/after a destructive write
// (category/product/delivery-zone deletion) so an empty table or a sudden
// drop in row count is immediately explainable instead of a mystery — see
// the incident where delivery_zones silently fell back to generic defaults
// with no record of what had actually happened to the real data.
export async function logActivity(supabase, { action, entityType, entityId, entityName, adminName, details }) {
  try {
    await supabase.from('admin_activity_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_name: entityName || null,
      admin_name: adminName || 'Admin',
      details: details || null,
    });
  } catch (err) {
    // Logging must never block the actual operation it's recording.
    console.warn('Failed to write admin activity log:', err.message);
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const adminOk = await isAdminRequest(req);
  if (!adminOk) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
    const { data, error } = await supabase
      .from('admin_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    throwIfError(error);
    return res.status(200).json(toCamelRows(data));
  } catch (error) {
    console.error('Error in /api/admin/activity:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
