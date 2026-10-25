import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../db/supabase.js';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';
import { getSessionFromRequest } from './_adminSession.js';
import { logActivity } from './admin/activity.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  if (req.method === 'GET') {
    try {
      // No auto-seeding — an empty table is a real state the admin should
      // see and investigate, not something to silently paper over with
      // generic defaults (that previously masked real data loss as if
      // nothing had happened).
      const { data: zones, error } = await supabase.from('delivery_zones').select('*');
      throwIfError(error);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).json(toCamelRows(zones));
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Admin authentication check for write methods
  const adminOk = await isAdminRequest(req);
  if (!adminOk) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!body.area || !body.pincode) {
        return res.status(400).json({ error: 'Area and pincode are required' });
      }

      const zoneId = body.id || `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newZone = {
        id: String(zoneId),
        area: String(body.area).trim(),
        pincode: String(body.pincode).trim(),
        time: String(body.time || '30 mins').trim(),
        distance: body.distance ? String(body.distance) : null,
        active: body.active !== false,
        deliveryFee: Number(body.deliveryFee) || 0,
        freeDeliveryThreshold: Number(body.freeDeliveryThreshold) || 0,
        handlingCharge: 0,
        minOrderValue: Number(body.minOrderValue) || 0,
        deliverySlots: Array.isArray(body.deliverySlots) ? body.deliverySlots : [],
        driverAssigned: body.driverAssigned ? String(body.driverAssigned).trim() : null,
      };

      const { data, error } = await supabase.from('delivery_zones').insert(toSnakeRow(newZone)).select();
      throwIfError(error);
      return res.status(201).json(toCamelRow(data?.[0]) || newZone);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const targetId = req.query.id || (typeof req.body === 'object' ? req.body?.id : null);
      if (!targetId) {
        return res.status(400).json({ error: 'Delivery zone ID is required' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const updateData = {};

      if (body.area !== undefined) updateData.area = String(body.area).trim();
      if (body.pincode !== undefined) updateData.pincode = String(body.pincode).trim();
      if (body.time !== undefined) updateData.time = String(body.time).trim();
      if (body.distance !== undefined) updateData.distance = body.distance ? String(body.distance) : null;
      if (body.active !== undefined) updateData.active = Boolean(body.active);
      if (body.deliveryFee !== undefined) updateData.deliveryFee = Number(body.deliveryFee) || 0;
      if (body.freeDeliveryThreshold !== undefined) updateData.freeDeliveryThreshold = Number(body.freeDeliveryThreshold) || 0;
      // Handling charge is no longer used — always 0, regardless of what a client sends.
      if (body.minOrderValue !== undefined) updateData.minOrderValue = Number(body.minOrderValue) || 0;
      if (body.deliverySlots !== undefined) updateData.deliverySlots = Array.isArray(body.deliverySlots) ? body.deliverySlots : [];
      if (body.driverAssigned !== undefined) updateData.driverAssigned = body.driverAssigned ? String(body.driverAssigned).trim() : null;

      const { data, error } = await supabase.from('delivery_zones').update(toSnakeRow(updateData)).eq('id', String(targetId)).select();
      throwIfError(error);
      return res.status(200).json(toCamelRow(data?.[0]) || { id: targetId, ...updateData });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const targetId = req.query.id || (typeof req.body === 'object' ? req.body?.id : null);
      if (!targetId) {
        return res.status(400).json({ error: 'Delivery zone ID is required' });
      }

      const { data: targetZone } = await supabase.from('delivery_zones').select('area').eq('id', String(targetId)).maybeSingle();
      const { error } = await supabase.from('delivery_zones').delete().eq('id', String(targetId));
      throwIfError(error);

      const session = getSessionFromRequest(req);
      await logActivity(supabase, {
        action: 'DELETE',
        entityType: 'delivery_zone',
        entityId: targetId,
        entityName: targetZone?.area || targetId,
        adminName: session?.name || session?.email,
      });

      return res.status(200).json({ success: true, id: targetId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
