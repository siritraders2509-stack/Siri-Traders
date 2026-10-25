import { getSupabase, toCamelRow, toCamelRows } from '../db/supabase.js';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';
import { getSessionFromRequest } from './_adminSession.js';
import { logActivity } from './admin/activity.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  const supabase = getSupabase();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) throw error;
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).json(toCamelRows(data) || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const adminOk = await isAdminRequest(req);
    if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Category name is required' });

      let catId = body.id || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (!catId) catId = `cat-${Date.now()}`;

      // Check if category ID already exists
      const { data: existing } = await supabase.from('categories').select('id').eq('id', catId);
      if (existing && existing.length > 0) {
        catId = `${catId}-${Date.now().toString().slice(-4)}`;
      }

      const { data, error } = await supabase.from('categories').insert({
        id: catId,
        name,
        image: body.image || '',
        color: body.color || '#F1F8E9',
        item_count: 0
      }).select();
      if (error) throw error;

      return res.status(201).json(toCamelRow(data[0]));
    } catch (err) {
      console.error('Error creating category:', err);
      return res.status(500).json({ error: `Failed to create category: ${err.message}` });
    }
  }

  if (req.method === 'DELETE') {
    const adminOk = await isAdminRequest(req);
    if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

    if (!id) return res.status(400).json({ error: 'Category ID is required for deletion' });

    try {
      const catId = String(id).trim();
      const { data: targetCat } = await supabase.from('categories').select('name').eq('id', catId).maybeSingle();
      const catName = targetCat?.name;

      let deletedProducts = [];
      try {
        const delQuery = catName
          ? supabase.from('products').delete().or(`category.eq.${catId},category.eq.${catName}`)
          : supabase.from('products').delete().eq('category', catId);
        const { data } = await delQuery.select('id');
        deletedProducts = data || [];
      } catch { /* best-effort, same as before */ }

      const { error } = await supabase.from('categories').delete().eq('id', catId);
      if (error) throw error;

      const session = getSessionFromRequest(req);
      await logActivity(supabase, {
        action: 'DELETE',
        entityType: 'category',
        entityId: catId,
        entityName: catName || catId,
        adminName: session?.name || session?.email,
        details: { cascadedProductCount: deletedProducts.length, cascadedProductIds: deletedProducts.map(p => p.id) },
      });

      return res.status(200).json({ success: true, id: catId, cascadedProductCount: deletedProducts.length });
    } catch (err) {
      console.error('Error deleting category:', err);
      return res.status(500).json({ error: `Failed to delete category: ${err.message}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
