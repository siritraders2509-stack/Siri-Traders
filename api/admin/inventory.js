import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../../db/supabase.js';
import { setCorsHeaders } from '../_cors.js';
import { isAdminRequest } from '../_adminAuth.js';
import { getSessionFromRequest } from '../_adminSession.js';

// Headroom for the one-time batch backfill of missing inventory rows.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const adminOk = await isAdminRequest(req);
  if (!adminOk) {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }

  const session = getSessionFromRequest(req);
  const currentAdminName = session?.name || session?.email || 'Admin';

  const action = req.query.action || 'list';
  const supabase = getSupabase();

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // 1. GET Requests
    // ──────────────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      // 1A. Fetch Movement / Adjustment Logs
      if (action === 'logs') {
        const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
        const limit = Math.min(200, parseInt(req.query.limit, 10) || 100);

        let query = supabase.from('inventory_logs').select('*').order('created_at', { ascending: false }).limit(limit);
        if (productId) {
          query = query.eq('product_id', productId);
        }

        const { data: logs, error } = await query;
        throwIfError(error);
        return res.status(200).json(toCamelRows(logs));
      }

      // 1B. Fetch full inventory overview & product stock tracking
      // Fetch all products
      const { data: productsRaw, error: prodErr } = await supabase.from('products').select('*');
      throwIfError(prodErr);
      const { data: inventoryRaw, error: invErr } = await supabase.from('inventory').select('*');
      throwIfError(invErr);

      const allProducts = toCamelRows(productsRaw);
      const allInventory = toCamelRows(inventoryRaw);

      // Map existing inventory by productId
      const invMap = new Map();
      allInventory.forEach(inv => invMap.set(inv.productId, inv));

      // Products with no inventory row yet get one auto-created — as a single
      // batched insert, not one awaited round trip per product in the loop
      // below (that used to make this request take minutes once dozens of
      // products had no row yet, since every one was a separate sequential
      // network hop to the database).
      const missingInv = allProducts.filter(p => !invMap.has(p.id));
      if (missingInv.length > 0) {
        const expDate = new Date();
        expDate.setMonth(expDate.getMonth() + 6);
        const expiryStr = expDate.toISOString().split('T')[0];

        const { data: newRowsRaw, error: insErr } = await supabase.from('inventory').insert(missingInv.map(prod => toSnakeRow({
          productId: prod.id,
          availableStock: 0,
          reservedStock: 0,
          damagedStock: 0,
          returnedStock: 0,
          expiredStock: 0,
          incomingStock: 0,
          reorderLevel: 10,
          costPrice: Math.max(10, Math.round((prod.price || 50) * 0.75)),
          expiryDate: expiryStr,
          batchNumber: `BAT-2026-${String(prod.id).padStart(3, '0')}`,
          location: 'Main Shelf'
        }))).select();
        throwIfError(insErr);

        toCamelRows(newRowsRaw).forEach(inv => invMap.set(inv.productId, inv));
      }

      // Fetch active orders to calculate dynamically reserved items
      const { data: activeOrdersRaw, error: ordErr } = await supabase.from('orders').select('id').in('status', ['Preparing', 'In Transit']);
      throwIfError(ordErr);
      const activeOrders = activeOrdersRaw || [];

      const reservedCountMap = new Map();
      if (activeOrders.length > 0) {
        const orderIds = activeOrders.map(o => o.id);
        const { data: itemsRaw, error: itemsErr } = await supabase.from('order_items').select('*').in('order_id', orderIds);
        throwIfError(itemsErr);
        toCamelRows(itemsRaw).forEach(item => {
          const prev = reservedCountMap.get(item.productId) || 0;
          reservedCountMap.set(item.productId, prev + (item.quantity || 1));
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const items = [];
      let totalValuation = 0;
      let totalRetailValuation = 0;
      let totalAvailableUnits = 0;
      let totalReservedUnits = 0;
      let totalDamagedUnits = 0;
      let totalReturnedUnits = 0;
      let totalExpiredUnits = 0;
      let totalIncomingUnits = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      let nearExpiryCount = 0;
      let expiredCount = 0;

      for (const prod of allProducts) {
        const inv = invMap.get(prod.id);

        const dynamicReserved = reservedCountMap.get(prod.id) || 0;
        const available = inv.availableStock ?? 0;
        const reorderLevel = inv.reorderLevel ?? 10;
        const costPrice = inv.costPrice > 0 ? inv.costPrice : Math.round((prod.price || 0) * 0.75);

        // Alerts calculations
        const isOutOfStock = available <= 0 || !prod.inStock;
        const isLowStock = !isOutOfStock && available <= reorderLevel;

        let daysUntilExpiry = null;
        let isNearExpiry = false;
        let isExpired = false;

        if (inv.expiryDate) {
          const exp = new Date(inv.expiryDate);
          if (!isNaN(exp.getTime())) {
            const diffMs = exp.getTime() - today.getTime();
            daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry < 0) {
              isExpired = true;
            } else if (daysUntilExpiry <= 30) {
              isNearExpiry = true;
            }
          }
        }

        const stockVal = available * costPrice;
        const retailVal = available * (prod.price || 0);

        totalValuation += stockVal;
        totalRetailValuation += retailVal;
        totalAvailableUnits += available;
        totalReservedUnits += dynamicReserved;
        totalDamagedUnits += (inv.damagedStock || 0);
        totalReturnedUnits += (inv.returnedStock || 0);
        totalExpiredUnits += (inv.expiredStock || 0);
        totalIncomingUnits += (inv.incomingStock || 0);

        if (isOutOfStock) outOfStockCount++;
        else if (isLowStock) lowStockCount++;

        if (isExpired) expiredCount++;
        else if (isNearExpiry) nearExpiryCount++;

        items.push({
          productId: prod.id,
          name: prod.name,
          category: prod.category,
          brand: prod.brand,
          weight: prod.weight,
          unit: prod.unit,
          price: prod.price,
          mrp: prod.mrp,
          image: prod.image,
          inStock: prod.inStock,
          wholesalePrice: prod.wholesalePrice,
          isWholesale: Boolean(prod.wholesalePrice),
          isPublished: prod.isPublished !== false,
          isArchived: Boolean(prod.isArchived),
          // Inventory Fields
          inventoryId: inv.id,
          availableStock: available,
          reservedStock: dynamicReserved,
          damagedStock: inv.damagedStock || 0,
          returnedStock: inv.returnedStock || 0,
          expiredStock: inv.expiredStock || 0,
          incomingStock: inv.incomingStock || 0,
          reorderLevel,
          costPrice,
          expiryDate: inv.expiryDate || '',
          batchNumber: inv.batchNumber || '',
          location: inv.location || 'Main Shelf',
          updatedAt: inv.updatedAt,
          // Valuation & Alerts
          stockValuation: stockVal,
          retailValuation: retailVal,
          isLowStock,
          isOutOfStock,
          isNearExpiry,
          isExpired,
          daysUntilExpiry
        });
      }

      const summary = {
        totalProducts: allProducts.length,
        totalValuation,
        totalRetailValuation,
        totalAvailableUnits,
        totalReservedUnits,
        totalDamagedUnits,
        totalReturnedUnits,
        totalExpiredUnits,
        totalIncomingUnits,
        lowStockCount,
        outOfStockCount,
        nearExpiryCount,
        expiredCount
      };

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(200).json({ summary, items });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. POST Requests (Stock Adjustments & Movements)
    // ──────────────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        productId,
        changeType = 'ADD', // 'ADD', 'SUBTRACT', 'SET', 'DAMAGE', 'RETURN', 'EXPIRED', 'RECEIVE_INCOMING'
        quantity = 0,
        targetField = 'availableStock', // 'availableStock', 'damagedStock', 'returnedStock', 'expiredStock', 'incomingStock'
        reason = 'Manual adjustment',
        notes = '',
        batchNumber,
        expiryDate,
        costPrice,
        reorderLevel
      } = body;

      const pId = parseInt(productId, 10);
      const qty = parseInt(quantity, 10);

      if (isNaN(pId) || isNaN(qty)) {
        return res.status(400).json({ error: 'Valid productId and quantity are required' });
      }

      // Find existing product and inventory
      const { data: prodRaw } = await supabase.from('products').select('*').eq('id', pId).maybeSingle();
      if (!prodRaw) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const prod = toCamelRow(prodRaw);

      let { data: invRaw } = await supabase.from('inventory').select('*').eq('product_id', pId).maybeSingle();
      let inv = invRaw ? toCamelRow(invRaw) : null;
      if (!inv) {
        const { data: createdInv, error: createErr } = await supabase.from('inventory').insert({
          product_id: pId,
          available_stock: 0,
          reorder_level: 10,
          cost_price: Math.round((prod.price || 50) * 0.75),
        }).select();
        throwIfError(createErr);
        inv = toCamelRow(createdInv[0]);
      }

      const stockBefore = inv.availableStock;
      let newAvailable = inv.availableStock;
      let newDamaged = inv.damagedStock;
      let newReturned = inv.returnedStock;
      let newExpired = inv.expiredStock;
      let newIncoming = inv.incomingStock;

      switch (changeType) {
        case 'ADD':
          if (targetField === 'damagedStock') newDamaged += qty;
          else if (targetField === 'returnedStock') newReturned += qty;
          else if (targetField === 'expiredStock') newExpired += qty;
          else if (targetField === 'incomingStock') newIncoming += qty;
          else newAvailable += qty;
          break;

        case 'SUBTRACT':
          if (targetField === 'damagedStock') newDamaged = Math.max(0, newDamaged - qty);
          else if (targetField === 'returnedStock') newReturned = Math.max(0, newReturned - qty);
          else if (targetField === 'expiredStock') newExpired = Math.max(0, newExpired - qty);
          else if (targetField === 'incomingStock') newIncoming = Math.max(0, newIncoming - qty);
          else newAvailable = Math.max(0, newAvailable - qty);
          break;

        case 'SET':
          if (targetField === 'damagedStock') newDamaged = Math.max(0, qty);
          else if (targetField === 'returnedStock') newReturned = Math.max(0, qty);
          else if (targetField === 'expiredStock') newExpired = Math.max(0, qty);
          else if (targetField === 'incomingStock') newIncoming = Math.max(0, qty);
          else newAvailable = Math.max(0, qty);
          break;

        case 'DAMAGE':
          // Move from available to damaged
          newAvailable = Math.max(0, newAvailable - qty);
          newDamaged += qty;
          break;

        case 'RETURN':
          // Customer return added to returned bucket & back to stock if requested
          newReturned += qty;
          newAvailable += qty;
          break;

        case 'EXPIRED':
          // Move from available to expired
          newAvailable = Math.max(0, newAvailable - qty);
          newExpired += qty;
          break;

        case 'RECEIVE_INCOMING':
          // Move from incoming to available
          newIncoming = Math.max(0, newIncoming - qty);
          newAvailable += qty;
          break;

        default:
          newAvailable = Math.max(0, newAvailable + qty);
      }

      // Update inventory table
      const updateData = {
        availableStock: newAvailable,
        damagedStock: newDamaged,
        returnedStock: newReturned,
        expiredStock: newExpired,
        incomingStock: newIncoming,
        updatedAt: new Date().toISOString(),
      };

      if (batchNumber !== undefined) updateData.batchNumber = batchNumber;
      if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
      if (costPrice !== undefined) updateData.costPrice = parseInt(costPrice, 10) || 0;
      if (reorderLevel !== undefined) updateData.reorderLevel = parseInt(reorderLevel, 10) || 10;

      const { data: updatedInvRaw, error: updErr } = await supabase.from('inventory')
        .update(toSnakeRow(updateData))
        .eq('product_id', pId)
        .select();
      throwIfError(updErr);
      const updatedInv = toCamelRow(updatedInvRaw[0]);

      // Automatically sync product.inStock with availableStock
      const shouldBeInStock = newAvailable > 0;
      if (prod.inStock !== shouldBeInStock) {
        await supabase.from('products').update({ in_stock: shouldBeInStock }).eq('id', pId);
      }

      // Insert log entry
      const { data: logEntryRaw, error: logErr } = await supabase.from('inventory_logs').insert({
        product_id: pId,
        product_name: prod.name,
        change_type: changeType,
        quantity: qty,
        stock_before: stockBefore,
        stock_after: newAvailable,
        reason: reason || 'Inventory adjustment',
        notes: notes || '',
        batch_number: batchNumber || inv.batchNumber || '',
        admin_name: currentAdminName,
      }).select();
      throwIfError(logErr);
      const logEntry = toCamelRow(logEntryRaw[0]);

      return res.status(200).json({
        success: true,
        inventory: updatedInv,
        log: logEntry
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. PUT Requests (Reorder Level & Product Batch Configuration)
    // ──────────────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        productId,
        reorderLevel,
        costPrice,
        expiryDate,
        batchNumber,
        location,
        incomingStock
      } = body;

      const pId = parseInt(productId, 10);
      if (isNaN(pId)) {
        return res.status(400).json({ error: 'Valid productId is required' });
      }

      const { data: prodRaw } = await supabase.from('products').select('*').eq('id', pId).maybeSingle();
      if (!prodRaw) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const prod = toCamelRow(prodRaw);

      const updateData = { updatedAt: new Date().toISOString() };
      if (reorderLevel !== undefined) updateData.reorderLevel = Math.max(0, parseInt(reorderLevel, 10) || 0);
      if (costPrice !== undefined) updateData.costPrice = Math.max(0, parseInt(costPrice, 10) || 0);
      if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
      if (batchNumber !== undefined) updateData.batchNumber = batchNumber;
      if (location !== undefined) updateData.location = location;
      if (incomingStock !== undefined) updateData.incomingStock = Math.max(0, parseInt(incomingStock, 10) || 0);

      const { data: updatedInvRaw, error: updErr } = await supabase.from('inventory')
        .update(toSnakeRow(updateData))
        .eq('product_id', pId)
        .select();
      throwIfError(updErr);
      const updatedInv = toCamelRow(updatedInvRaw[0]);

      // Log config change
      const { error: logErr } = await supabase.from('inventory_logs').insert({
        product_id: pId,
        product_name: prod.name,
        change_type: 'CONFIG_UPDATE',
        quantity: 0,
        stock_before: updatedInv.availableStock,
        stock_after: updatedInv.availableStock,
        reason: `Updated reorder settings: Reorder Lvl=${updatedInv.reorderLevel}, Exp=${updatedInv.expiryDate || 'N/A'}, Batch=${updatedInv.batchNumber || 'N/A'}`,
        notes: `Cost: ₹${updatedInv.costPrice}, Incoming: ${updatedInv.incomingStock}`,
        batch_number: updatedInv.batchNumber || '',
        admin_name: currentAdminName,
      });
      throwIfError(logErr);

      return res.status(200).json({ success: true, inventory: updatedInv });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Inventory API error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
