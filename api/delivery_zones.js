import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../db/supabase.js';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';

const DEFAULT_14_ZONES = [
  { id: 'zone-1', area: 'Isnapur', pincode: '502307', time: '15-30 mins', distance: '0-3 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 299, handlingCharge: 0, minOrderValue: 100 },
  { id: 'zone-2', area: 'Chitkul', pincode: '502307', time: '15-30 mins', distance: '0-3 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 299, handlingCharge: 0, minOrderValue: 100 },
  { id: 'zone-3', area: 'Muttangi', pincode: '502307', time: '20-35 mins', distance: '2-5 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 0, minOrderValue: 150 },
  { id: 'zone-4', area: 'Rudraram', pincode: '502307', time: '25-40 mins', distance: '3-6 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 0, minOrderValue: 150 },
  { id: 'zone-5', area: 'Indrakaran', pincode: '502307', time: '25-40 mins', distance: '4-7 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 499, handlingCharge: 0, minOrderValue: 200 },
  { id: 'zone-6', area: 'Lakdaram', pincode: '502307', time: '30-45 mins', distance: '5-8 km', active: true, deliveryFee: 25, freeDeliveryThreshold: 499, handlingCharge: 0, minOrderValue: 200 },
  { id: 'zone-7', area: 'Bachuguda', pincode: '502307', time: '20-35 mins', distance: '2-4 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 0, minOrderValue: 150 },
  { id: 'zone-8', area: 'Indresham', pincode: '502334', time: '25-40 mins', distance: '3-6 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 0, minOrderValue: 150 },
  { id: 'zone-9', area: 'Pocharam', pincode: '502307', time: '30-45 mins', distance: '5-8 km', active: true, deliveryFee: 25, freeDeliveryThreshold: 499, handlingCharge: 0, minOrderValue: 200 },
  { id: 'zone-10', area: 'Patancheru', pincode: '502319', time: '30-45 mins', distance: '6-9 km', active: true, deliveryFee: 25, freeDeliveryThreshold: 499, handlingCharge: 0, minOrderValue: 200 },
  { id: 'zone-11', area: 'Beeramguda', pincode: '502032', time: '35-50 mins', distance: '8-12 km', active: true, deliveryFee: 30, freeDeliveryThreshold: 599, handlingCharge: 0, minOrderValue: 250 },
  { id: 'zone-12', area: 'Ameenpur', pincode: '502032', time: '35-50 mins', distance: '9-13 km', active: true, deliveryFee: 30, freeDeliveryThreshold: 599, handlingCharge: 0, minOrderValue: 250 },
  { id: 'zone-13', area: 'Ramachandrapuram (RC Puram)', pincode: '502032', time: '40-55 mins', distance: '10-14 km', active: true, deliveryFee: 35, freeDeliveryThreshold: 699, handlingCharge: 0, minOrderValue: 300 },
  { id: 'zone-14', area: 'Kandi / Sangareddy', pincode: '502285', time: '45-60 mins', distance: '12-16 km', active: true, deliveryFee: 40, freeDeliveryThreshold: 799, handlingCharge: 0, minOrderValue: 350 }
];

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  if (req.method === 'GET') {
    try {
      let { data: zones, error } = await supabase.from('delivery_zones').select('*');
      throwIfError(error);
      if (!zones || zones.length === 0) {
        // Auto-seed 14 default delivery zones if table is empty
        for (const zone of DEFAULT_14_ZONES) {
          await supabase.from('delivery_zones').upsert(toSnakeRow(zone), { onConflict: 'id', ignoreDuplicates: true });
        }
        const reseeded = await supabase.from('delivery_zones').select('*');
        zones = reseeded.data;
      }
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).json(zones?.length ? toCamelRows(zones) : DEFAULT_14_ZONES);
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

      const { error } = await supabase.from('delivery_zones').delete().eq('id', String(targetId));
      throwIfError(error);
      return res.status(200).json({ success: true, id: targetId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
