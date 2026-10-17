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

  const targetId = req.query.id || (typeof req.body === 'object' ? req.body?.id : null);
  const supabase = getSupabase();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('coupons').select('*');
      throwIfError(error);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).json(toCamelRows(data));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Admin authentication check for POST, PUT, DELETE
  const adminOk = await isAdminRequest(req);
  if (!adminOk) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  let code;
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      code = String(body.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'code is required' });
      }

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
      throwIfError(error);

      return res.status(201).json(toCamelRow(data?.[0]) || toCamelRow(values));
    } catch (err) {
      if (err.message?.includes('coupons_code_unique') || err.code === '23505') {
        return res.status(400).json({ error: `Coupon code "${code}" already exists. Please choose a unique coupon code or edit the existing coupon.` });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      if (!targetId) {
        return res.status(400).json({ error: 'Coupon ID is required' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
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

      const searchStr = String(targetId).trim();
      const { data, error } = await supabase.from('coupons').update(patch)
        .or(`id.eq.${searchStr},code.eq.${searchStr.toUpperCase()}`)
        .select();
      throwIfError(error);

      return res.status(200).json(toCamelRow(data?.[0]) || { id: targetId, ...toCamelRow(patch) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      if (!targetId) {
        return res.status(400).json({ error: 'Coupon ID is required' });
      }

      const searchStr = String(targetId).trim();
      const { error } = await supabase.from('coupons').delete()
        .or(`id.eq.${searchStr},code.eq.${searchStr.toUpperCase()}`);
      throwIfError(error);
      return res.status(200).json({ success: true, id: targetId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
