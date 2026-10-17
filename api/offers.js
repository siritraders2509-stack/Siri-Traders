import { db, offers, coupons } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';

const MAX_PG_INT = 2147483647;

const safeInt = (val, fallback = 0) => {
  if (val == null || val === '') return fallback;
  const num = Math.round(Number(val));
  if (isNaN(num)) return fallback;
  return Math.max(0, Math.min(MAX_PG_INT, num));
};

// The one-time schema migrations that used to run here (adding columns to
// `offers`/`coupons`) have long since applied in production, and — unlike
// the equivalent guards elsewhere — these ran on every single call with no
// in-memory flag at all. Removed entirely; this was a meaningful chunk of
// what exhausted the daily Hyperdrive quota.

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id, resource, action } = req.query;

  try {
    // ── Coupons Handler ───────────────────────────────────────────────
    if (resource === 'coupons' || action === 'coupons') {
      if (!id) {
        if (req.method === 'GET') {
          const allCoupons = await db.select().from(coupons);
          return res.status(200).json(allCoupons);
        }

        if (req.method === 'POST') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const code = String(body.code || '').trim().toUpperCase();
          if (!code) return res.status(400).json({ error: 'code is required' });

          const couponId = body.id || `coupon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const values = {
            id: couponId,
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

          let saved;
          try {
            saved = await db.insert(coupons).values(values).onConflictDoUpdate({
              target: coupons.code,
              set: values
            }).returning();
          } catch (insertErr) {
            if (insertErr.message?.includes('coupons_code_unique') || insertErr.code === '23505') {
              return res.status(400).json({ error: `Coupon code "${code}" already exists. Please choose a unique coupon code or edit the existing coupon.` });
            }
            console.warn("Retrying coupon insert after schema migration...", insertErr.message);
            try {
              saved = await db.insert(coupons).values(values).onConflictDoUpdate({
                target: coupons.code,
                set: values
              }).returning();
            } catch (err2) {
              if (err2.message?.includes('coupons_code_unique') || err2.code === '23505') {
                return res.status(400).json({ error: `Coupon code "${code}" already exists. Please choose a unique coupon code or edit the existing coupon.` });
              }
              throw err2;
            }
          }

          return res.status(201).json(saved[0]);
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

          let updated;
          try {
            updated = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning();
          } catch (updateErr) {
            console.warn("Retrying coupon update after schema migration...", updateErr.message);
            updated = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning();
          }

          return res.status(200).json(updated[0]);
        }

        if (req.method === 'DELETE') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          await db.delete(coupons).where(eq(coupons.id, id));
          return res.status(200).json({ success: true, id });
        }
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Offers Handler: /api/offers ───────────────────────────────────
    if (!id) {
      if (req.method === 'GET') {
        const allOffers = await db.select().from(offers);
        const parsed = (allOffers || []).map(o => {
          let comboItems = [];
          if (o.comboItems) {
            try { comboItems = typeof o.comboItems === 'string' ? JSON.parse(o.comboItems) : o.comboItems; } catch { comboItems = []; }
          }
          return { ...o, comboItems: Array.isArray(comboItems) ? comboItems : [] };
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
          id: offerId,
          title,
          subtitle: body.subtitle || '',
          price: safeInt(body.price, 0),
          mrp: safeInt(body.mrp, safeInt(body.price, 0)),
          badge: body.badge || '',
          image: body.image || '',
          link: body.link || '/categories',
          groupType: body.group || body.groupType || 'daily',
          type: body.type || 'Sale offer',
          buyQty: safeInt(body.buyQty, 1),
          getQty: safeInt(body.getQty, 1),
          targetCategory: body.targetCategory || null,
          targetProductId: body.targetProductId ? safeInt(body.targetProductId, null) : null,
          itemsIncluded: body.itemsIncluded || body.items_included || '',
          comboItems: comboItemsStr,
          startDate: body.startDate || null,
          endDate: body.endDate || null,
          usageLimit: body.usageLimit ? safeInt(body.usageLimit, null) : null,
          timesClaimed: safeInt(body.timesClaimed, 0),
          active: body.active !== false
        };

        let saved;
        try {
          saved = await db.insert(offers).values(values).onConflictDoUpdate({
            target: offers.id,
            set: values
          }).returning();
        } catch (insertErr) {
          console.warn("Retrying offers insert after auto-migration...", insertErr.message);
          saved = await db.insert(offers).values(values).onConflictDoUpdate({
            target: offers.id,
            set: values
          }).returning();
        }

        const resObj = saved[0] ? { ...saved[0] } : { ...values };
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
      if (body.group !== undefined) patch.groupType = body.group;
      if (body.groupType !== undefined) patch.groupType = body.groupType;
      if (body.type !== undefined) patch.type = body.type;
      if (body.buyQty !== undefined) patch.buyQty = safeInt(body.buyQty, 1);
      if (body.getQty !== undefined) patch.getQty = safeInt(body.getQty, 1);
      if (body.targetCategory !== undefined) patch.targetCategory = body.targetCategory;
      if (body.targetProductId !== undefined) patch.targetProductId = body.targetProductId ? safeInt(body.targetProductId, null) : null;
      if (body.itemsIncluded !== undefined) patch.itemsIncluded = body.itemsIncluded;
      if (body.comboItems !== undefined || body.combo_items !== undefined) {
        const rawCombo = body.comboItems || body.combo_items;
        patch.comboItems = Array.isArray(rawCombo) || typeof rawCombo === 'object'
          ? JSON.stringify(rawCombo)
          : String(rawCombo || '[]');
      }
      if (body.startDate !== undefined) patch.startDate = body.startDate;
      if (body.endDate !== undefined) patch.endDate = body.endDate;
      if (body.usageLimit !== undefined) patch.usageLimit = body.usageLimit ? safeInt(body.usageLimit, null) : null;
      if (body.timesClaimed !== undefined) patch.timesClaimed = safeInt(body.timesClaimed, 0);
      if (body.active !== undefined) patch.active = Boolean(body.active);

      let updated;
      try {
        updated = await db.update(offers).set(patch).where(eq(offers.id, id)).returning();
      } catch (updateErr) {
        console.warn("Retrying offers update after auto-migration...", updateErr.message);
        updated = await db.update(offers).set(patch).where(eq(offers.id, id)).returning();
      }

      return res.status(200).json(updated[0]);
    }

    if (req.method === 'DELETE') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      await db.delete(offers).where(eq(offers.id, id));
      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error("Error in /api/offers:", error);
    const msg = error?.message || 'Failed to save offer';
    return res.status(500).json({ error: msg });
  }
}
