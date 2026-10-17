import { getSupabase, toCamelRow, toCamelRows, throwIfError } from '../db/supabase.js';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';

const MAX_PG_INT = 2147483647;

const safeInt = (val, fallback = 0) => {
  if (val == null || val === '') return fallback;
  const num = Math.round(Number(val));
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(MAX_PG_INT, num));
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id, resource, action } = req.query;
  const supabase = getSupabase();

  try {
    // ── Coupons Handler ───────────────────────────────────────────────
    if (resource === 'coupons' || action === 'coupons') {
      if (!id) {
        if (req.method === 'GET') {
          const { data, error } = await supabase.from('coupons').select('*');
          throwIfError(error);
          return res.status(200).json(toCamelRows(data));
        }

        if (req.method === 'POST') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const code = String(body.code || '').trim().toUpperCase();
          if (!code) return res.status(400).json({ error: 'code is required' });

          const couponId = body.id || `coupon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const values = {
            id: String(couponId),
            code,
            type: body.type || 'flat',
            value: safeInt(body.value, 0),
            min_order: safeInt(body.minOrder, 0),
            max_discount: body.maxDiscount ? safeInt(body.maxDiscount, null) : null,
            buy_quantity: safeInt(body.buyQuantity, 1),
            get_quantity: safeInt(body.getQuantity, 1),
            target_type: body.targetType || 'all',
            target_category: body.targetCategory || null,
            target_product_id: body.targetProductId ? safeInt(body.targetProductId, null) : null,
            target_customer_email: body.targetCustomerEmail || null,
            usage_limit: body.usageLimit ? safeInt(body.usageLimit, null) : null,
            per_user_limit: safeInt(body.perUserLimit, 1),
            times_used: safeInt(body.timesUsed, 0),
            total_discount_given: safeInt(body.totalDiscountGiven, 0),
            start_date: body.startDate || null,
            end_date: body.endDate || null,
            title: body.title || '',
            description: body.description || '',
            customer_type: body.customerType || 'retail',
            active: body.active !== false,
          };

          const { data, error } = await supabase.from('coupons').upsert(values, { onConflict: 'code' }).select();
          if (error) {
            if (error.message?.includes('coupons_code_unique') || error.code === '23505') {
              return res.status(400).json({ error: `Coupon code "${code}" already exists. Please choose a unique coupon code or edit the existing coupon.` });
            }
            throwIfError(error);
          }

          return res.status(201).json(toCamelRow(data[0]));
        }
      } else {
        if (req.method === 'PUT') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const patch = {};
          if (body.code !== undefined) patch.code = String(body.code).trim().toUpperCase();
          if (body.type !== undefined) patch.type = body.type;
          if (body.value !== undefined) patch.value = safeInt(body.value, 0);
          if (body.minOrder !== undefined) patch.min_order = safeInt(body.minOrder, 0);
          if (body.maxDiscount !== undefined) patch.max_discount = body.maxDiscount ? safeInt(body.maxDiscount, null) : null;
          if (body.buyQuantity !== undefined) patch.buy_quantity = safeInt(body.buyQuantity, 1);
          if (body.getQuantity !== undefined) patch.get_quantity = safeInt(body.getQuantity, 1);
          if (body.targetType !== undefined) patch.target_type = body.targetType;
          if (body.targetCategory !== undefined) patch.target_category = body.targetCategory;
          if (body.targetProductId !== undefined) patch.target_product_id = body.targetProductId ? safeInt(body.targetProductId, null) : null;
          if (body.targetCustomerEmail !== undefined) patch.target_customer_email = body.targetCustomerEmail;
          if (body.usageLimit !== undefined) patch.usage_limit = body.usageLimit ? safeInt(body.usageLimit, null) : null;
          if (body.perUserLimit !== undefined) patch.per_user_limit = safeInt(body.perUserLimit, 1);
          if (body.timesUsed !== undefined) patch.times_used = safeInt(body.timesUsed, 0);
          if (body.totalDiscountGiven !== undefined) patch.total_discount_given = safeInt(body.totalDiscountGiven, 0);
          if (body.startDate !== undefined) patch.start_date = body.startDate;
          if (body.endDate !== undefined) patch.end_date = body.endDate;
          if (body.title !== undefined) patch.title = body.title;
          if (body.description !== undefined) patch.description = body.description;
          if (body.customerType !== undefined) patch.customer_type = body.customerType;
          if (body.active !== undefined) patch.active = Boolean(body.active);

          const { data, error } = await supabase.from('coupons').update(patch).eq('id', id).select();
          throwIfError(error);

          return res.status(200).json(toCamelRow(data[0]));
        }

        if (req.method === 'DELETE') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const { error } = await supabase.from('coupons').delete().eq('id', id);
          throwIfError(error);
          return res.status(200).json({ success: true, id });
        }
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Offers Handler: /api/offers ───────────────────────────────────
    if (!id) {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('offers').select('*');
        throwIfError(error);
        const parsed = (data || []).map(o => {
          let comboItems = [];
          if (o.combo_items) {
            try { comboItems = typeof o.combo_items === 'string' ? JSON.parse(o.combo_items) : o.combo_items; } catch { comboItems = []; }
          }
          return { ...toCamelRow(o), comboItems: Array.isArray(comboItems) ? comboItems : [] };
        });
        return res.status(200).json(parsed);
      }

      if (req.method === 'POST') {
        const adminOk = await isAdminRequest(req);
        if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const title = String(body.title || '').trim();
        if (!title) return res.status(400).json({ error: 'title is required' });
        if (String(body.image || '').startsWith('data:')) {
          return res.status(400).json({ error: 'Upload the image instead of pasting image data' });
        }

        const offerId = body.id || `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const rawCombo = body.comboItems || body.combo_items;
        const comboItemsStr = Array.isArray(rawCombo) || (rawCombo && typeof rawCombo === 'object')
          ? JSON.stringify(rawCombo)
          : (typeof rawCombo === 'string' ? rawCombo : '[]');

        const values = {
          id: String(offerId),
          title,
          subtitle: body.subtitle || '',
          price: safeInt(body.price, 0),
          mrp: safeInt(body.mrp, safeInt(body.price, 0)),
          badge: body.badge || '',
          image: body.image || '',
          link: body.link || '/categories',
          group_type: body.group || body.groupType || 'daily',
          type: body.type || 'Sale offer',
          buy_qty: safeInt(body.buyQty, 1),
          get_qty: safeInt(body.getQty, 1),
          target_category: body.targetCategory || null,
          target_product_id: body.targetProductId ? safeInt(body.targetProductId, null) : null,
          items_included: body.itemsIncluded || body.items_included || '',
          combo_items: comboItemsStr,
          start_date: body.startDate || null,
          end_date: body.endDate || null,
          usage_limit: body.usageLimit ? safeInt(body.usageLimit, null) : null,
          times_claimed: safeInt(body.timesClaimed, 0),
          active: body.active !== false,
        };

        const { data, error } = await supabase.from('offers').upsert(values, { onConflict: 'id' }).select();
        throwIfError(error);

        const resObj = data[0] ? toCamelRow(data[0]) : toCamelRow(values);
        try { resObj.comboItems = JSON.parse(resObj.comboItems || '[]'); } catch { resObj.comboItems = []; }
        return res.status(201).json(resObj);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Item: /api/offers?id=:id ────────────────────────────────────────
    if (req.method === 'PUT') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const patch = {};
      if (body.title !== undefined) patch.title = String(body.title).trim();
      if (body.subtitle !== undefined) patch.subtitle = body.subtitle;
      if (body.price !== undefined) patch.price = safeInt(body.price, 0);
      if (body.mrp !== undefined) patch.mrp = safeInt(body.mrp, 0);
      if (body.badge !== undefined) patch.badge = body.badge;
      if (body.image !== undefined) {
        if (String(body.image || '').startsWith('data:')) {
          return res.status(400).json({ error: 'Upload the image instead of pasting image data' });
        }
        patch.image = body.image;
      }
      if (body.link !== undefined) patch.link = body.link;
      if (body.group !== undefined) patch.group_type = body.group;
      if (body.groupType !== undefined) patch.group_type = body.groupType;
      if (body.type !== undefined) patch.type = body.type;
      if (body.buyQty !== undefined) patch.buy_qty = safeInt(body.buyQty, 1);
      if (body.getQty !== undefined) patch.get_qty = safeInt(body.getQty, 1);
      if (body.targetCategory !== undefined) patch.target_category = body.targetCategory;
      if (body.targetProductId !== undefined) patch.target_product_id = body.targetProductId ? safeInt(body.targetProductId, null) : null;
      if (body.itemsIncluded !== undefined) patch.items_included = body.itemsIncluded;
      if (body.comboItems !== undefined || body.combo_items !== undefined) {
        const rawCombo = body.comboItems || body.combo_items;
        patch.combo_items = Array.isArray(rawCombo) || typeof rawCombo === 'object'
          ? JSON.stringify(rawCombo)
          : String(rawCombo || '[]');
      }
      if (body.startDate !== undefined) patch.start_date = body.startDate;
      if (body.endDate !== undefined) patch.end_date = body.endDate;
      if (body.usageLimit !== undefined) patch.usage_limit = body.usageLimit ? safeInt(body.usageLimit, null) : null;
      if (body.timesClaimed !== undefined) patch.times_claimed = safeInt(body.timesClaimed, 0);
      if (body.active !== undefined) patch.active = Boolean(body.active);

      const { data, error } = await supabase.from('offers').update(patch).eq('id', id).select();
      throwIfError(error);

      return res.status(200).json(toCamelRow(data[0]));
    }

    if (req.method === 'DELETE') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const { error } = await supabase.from('offers').delete().eq('id', id);
      throwIfError(error);
      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error("Error in /api/offers:", error);
    const msg = error?.message || 'Failed to save offer';
    return res.status(500).json({ error: msg });
  }
}
