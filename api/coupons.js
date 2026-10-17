import { db, coupons } from '../db/index.js';
import { eq, or } from 'drizzle-orm';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';

const MAX_PG_INT = 2147483647;

const safeInt = (val, fallback = 0) => {
  if (val == null || val === '') return fallback;
  const num = Math.round(Number(val));
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(MAX_PG_INT, num));
};

// The one-time schema migration that used to run here (adding bulk-pricing
// /targeting columns to `coupons`) has long since applied in production —
// re-checking it via ALTER TABLE on every cold Workers isolate burns a real
// Hyperdrive query for no benefit, which is exactly what exhausted the
// daily Hyperdrive quota. Removed; if a genuinely new column is ever
// needed, add it as a real migration instead of a runtime guard like this.

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetId = req.query.id || (typeof req.body === 'object' ? req.body?.id : null);

  if (req.method === 'GET') {
    try {
      const allCoupons = await db.select().from(coupons);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).json(allCoupons || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Admin authentication check for POST, PUT, DELETE
  const adminOk = await isAdminRequest(req);
  if (!adminOk) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const code = String(body.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'code is required' });
      }

      const couponId = body.id || `coupon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const values = {
        id: String(couponId),
        code,
        type: body.type || 'flat',
        value: safeInt(body.value, 0),
        minOrder: safeInt(body.minOrder, 0),
        maxDiscount: body.maxDiscount ? safeInt(body.maxDiscount, null) : null,
        buyQuantity: safeInt(body.buyQuantity, 1),
        getQuantity: safeInt(body.getQuantity, 1),
        targetType: body.targetType || 'all',
        targetCategory: body.targetCategory || null,
        targetProductId: body.targetProductId ? safeInt(body.targetProductId, null) : null,
        targetCustomerEmail: body.targetCustomerEmail || null,
        usageLimit: body.usageLimit ? safeInt(body.usageLimit, null) : null,
        perUserLimit: safeInt(body.perUserLimit, 1),
        timesUsed: safeInt(body.timesUsed, 0),
        totalDiscountGiven: safeInt(body.totalDiscountGiven, 0),
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        title: body.title || '',
        description: body.description || '',
        customerType: body.customerType || 'retail',
        active: body.active !== false
      };

      const [saved] = await db.insert(coupons).values(values).onConflictDoUpdate({
        target: coupons.code,
        set: values
      }).returning();

      return res.status(201).json(saved || values);
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
      if (body.minOrder !== undefined) patch.minOrder = safeInt(body.minOrder, 0);
      if (body.maxDiscount !== undefined) patch.maxDiscount = body.maxDiscount ? safeInt(body.maxDiscount, null) : null;
      if (body.buyQuantity !== undefined) patch.buyQuantity = safeInt(body.buyQuantity, 1);
      if (body.getQuantity !== undefined) patch.getQuantity = safeInt(body.getQuantity, 1);
      if (body.targetType !== undefined) patch.targetType = body.targetType;
      if (body.targetCategory !== undefined) patch.targetCategory = body.targetCategory;
      if (body.targetProductId !== undefined) patch.targetProductId = body.targetProductId ? safeInt(body.targetProductId, null) : null;
      if (body.targetCustomerEmail !== undefined) patch.targetCustomerEmail = body.targetCustomerEmail;
      if (body.usageLimit !== undefined) patch.usageLimit = body.usageLimit ? safeInt(body.usageLimit, null) : null;
      if (body.perUserLimit !== undefined) patch.perUserLimit = safeInt(body.perUserLimit, 1);
      if (body.timesUsed !== undefined) patch.timesUsed = safeInt(body.timesUsed, 0);
      if (body.totalDiscountGiven !== undefined) patch.totalDiscountGiven = safeInt(body.totalDiscountGiven, 0);
      if (body.startDate !== undefined) patch.startDate = body.startDate;
      if (body.endDate !== undefined) patch.endDate = body.endDate;
      if (body.title !== undefined) patch.title = body.title;
      if (body.description !== undefined) patch.description = body.description;
      if (body.customerType !== undefined) patch.customerType = body.customerType;
      if (body.active !== undefined) patch.active = Boolean(body.active);

      const searchStr = String(targetId).trim();
      const [updated] = await db.update(coupons).set(patch).where(
        or(eq(coupons.id, searchStr), eq(coupons.code, searchStr.toUpperCase()))
      ).returning();

      return res.status(200).json(updated || { id: targetId, ...patch });
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
      await db.delete(coupons).where(
        or(eq(coupons.id, searchStr), eq(coupons.code, searchStr.toUpperCase()))
      );
      return res.status(200).json({ success: true, id: targetId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
