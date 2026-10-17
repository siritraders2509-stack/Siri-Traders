import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../db/supabase.js';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { setCorsHeaders } from './_cors.js';
import { clerk, getAuthenticatedUserId } from './_clerkAuth.js';
import { sendOrderNotificationEmail, sendCustomerOrderConfirmationEmail } from './_email.js';
import { sendOrderNotificationSMS } from './_sms.js';

// Setup Upstash Redis rate limiting: 10 requests per 30 seconds for orders
// endpoint. Built lazily (on first use within a request), not at module
// load — on Workers, env vars/secrets only exist once a request is being
// handled, so reading process.env at module scope (as this used to) could
// capture an empty URL/token permanently for the isolate's lifetime.
let _ratelimit = null;
function getRatelimit() {
  if (!_ratelimit) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
    _ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '30 s'),
    });
  }
  return _ratelimit;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  const supabase = getSupabase();

  // 1. Auth check
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Item: /api/orders?id=:id — single order, ownership-checked ───────────
  if (id) {
    if (req.method !== 'GET' && req.method !== 'PATCH') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      let cleanId = id;
      if (typeof id === 'string' && id.startsWith('ORD-')) {
        cleanId = id.slice(4);
      }
      const parsedId = parseInt(cleanId, 10);
      if (Number.isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('id', parsedId).maybeSingle();
      throwIfError(orderErr);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.user_id !== userId) {
        return res.status(403).json({ error: 'Forbidden: You do not own this order' });
      }

      if (req.method === 'GET') {
        const { data: items, error: itemsErr } = await supabase.from('order_items').select('*').eq('order_id', order.id);
        throwIfError(itemsErr);
        return res.status(200).json({ ...toCamelRow(order), items: toCamelRows(items) });
      }

      // PATCH — customer self-service: cancel (before shipping) or request a
      // return (after delivery). Deliberately narrow: a customer can only
      // trigger these two specific transitions on their own order, never set
      // status/paymentStatus/returnStatus directly the way the admin
      // endpoint can.
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const action = body.action;

      if (action === 'cancel') {
        if (!['Preparing', 'Paid'].includes(order.status)) {
          return res.status(400).json({ error: 'This order can no longer be cancelled — it has already shipped or been delivered.' });
        }

        const { data: updatedRows, error: updErr } = await supabase.from('orders').update({
          status: 'Cancelled',
          cancellation_reason: body.reason || 'Cancelled by customer',
          cancelled_at: new Date().toISOString(),
          payment_status: order.payment_status === 'Paid' ? 'Unpaid' : order.payment_status,
        }).eq('id', parsedId).select();
        throwIfError(updErr);

        // Best-effort restock, mirroring the admin cancellation path.
        try {
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', parsedId);
          for (const item of (items || [])) {
            if (!item.product_id) continue;
            const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', item.product_id).maybeSingle();
            if (inv) {
              const newStock = (inv.available_stock || 0) + (item.quantity || 1);
              await supabase.from('inventory').update({ available_stock: newStock }).eq('product_id', item.product_id);
              await supabase.from('inventory_logs').insert({
                product_id: item.product_id,
                product_name: item.name,
                change_type: 'RETURN',
                quantity: item.quantity || 1,
                stock_before: inv.available_stock || 0,
                stock_after: newStock,
                reason: `Order #${parsedId} cancelled by customer`,
                admin_name: 'Customer',
              });
            }
          }
        } catch (restockErr) {
          console.warn('Restock warning on customer cancellation:', restockErr.message);
        }

        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', parsedId);
        return res.status(200).json({ ...toCamelRow(updatedRows[0]), items: toCamelRows(items) });
      }

      if (action === 'return') {
        if (order.status !== 'Delivered') {
          return res.status(400).json({ error: 'Only delivered orders can be returned.' });
        }
        if (order.return_status && order.return_status !== 'None') {
          return res.status(400).json({ error: 'A return has already been requested for this order.' });
        }

        const { data: updatedRows, error: updErr } = await supabase.from('orders').update({
          return_status: 'Requested',
          return_reason: body.reason || 'Customer requested return',
        }).eq('id', parsedId).select();
        throwIfError(updErr);

        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', parsedId);
        return res.status(200).json({ ...toCamelRow(updatedRows[0]), items: toCamelRows(items) });
      }

      return res.status(400).json({ error: 'Invalid action. Use "cancel" or "return".' });
    } catch (error) {
      console.error("Error in /api/orders?id:", error);
      return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
    }
  }

  // ── Collection: /api/orders ────────────────────────────────────────────
  // 2. Rate limiting check (using userId as the rate limit key)
  try {
    if (process.env.UPSTASH_REDIS_REST_URL) {
      const { success } = await getRatelimit().limit(`orders_${userId}`);
      if (!success) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
    }
  } catch (err) {
    console.error("Rate limiting connection warning:", err);
    // Fail-open for rate limiter so we don't block users if Redis is down
  }

  try {
    if (req.method === 'GET') {
      const { data: userOrders, error: ordersErr } = await supabase.from('orders').select('*').eq('user_id', userId);
      throwIfError(ordersErr);
      if (!userOrders.length) {
        return res.status(200).json([]);
      }
      const orderIds = userOrders.map(o => o.id);
      const { data: allItems, error: itemsErr } = await supabase.from('order_items').select('*').in('order_id', orderIds);
      throwIfError(itemsErr);

      const camelItems = toCamelRows(allItems);
      const ordersWithItems = toCamelRows(userOrders).map(order => ({
        ...order,
        items: camelItems.filter(item => item.orderId === order.id)
      }));

      // Sort orders descending so the latest ones show up first
      ordersWithItems.sort((a, b) => b.id - a.id);

      return res.status(200).json(ordersWithItems);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { items, total, deliveryAddress, paymentMethod } = body;

      // Admin can close the store (settings.homeSections.storeOpen === false)
      // or enforce a minimum order value requirement.
      const { data: siteRow, error: siteErr } = await supabase.from('settings').select('home_sections, min_order_value').eq('id', 'default').maybeSingle();
      throwIfError(siteErr);
      if (siteRow?.home_sections?.storeOpen === false) {
        return res.status(403).json({ error: 'The store is closed right now. Please try again when we reopen.', storeClosed: true });
      }

      if (!Array.isArray(items) || items.length === 0 || !total) {
        return res.status(400).json({ error: 'Missing order details' });
      }

      const minOrderVal = Number(siteRow?.min_order_value) || 0;
      const subtotalVal = Number(body.subtotal) || Number(total) || 0;
      const hasCoupon = Boolean(body.couponCode || Number(body.discount) > 0);
      if (minOrderVal > 0 && !hasCoupon && subtotalVal < minOrderVal) {
        return res.status(400).json({ error: `Minimum order value is ₹${minOrderVal}. Please add items worth ₹${minOrderVal - subtotalVal} more to place your order.` });
      }

      // Sync user data to DB to ensure we have a record
      let customerEmail = '';
      let customerName = '';
      try {
        const clerkUser = await clerk.users.getUser(userId);
        const email = clerkUser.emailAddresses[0]?.emailAddress || '';
        const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
        const phone = clerkUser.phoneNumbers[0]?.phoneNumber || '';

        customerEmail = email;
        customerName = name || 'Customer';

        if (email) {
          // Only upsert if we have an email (it's a unique NOT NULL column)
          await supabase.from('users').upsert({
            id: userId,
            email,
            name: name || 'Customer',
            phone,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
        }
      } catch (err) {
        console.warn("Failed to sync user data, proceeding with order anyway:", err.message);
      }

      const isCod = (paymentMethod || '').toLowerCase().includes('cod');
      const txnId = isCod ? `COD-SIRI-${Math.floor(100000 + Math.random() * 900000)}` : `TXN-SIRI-${Math.floor(200000 + Math.random() * 900000)}`;
      const trackingNumber = `TRK-SIRI-${Math.floor(500000 + Math.random() * 900000)}`;

      const computedSubtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty || i.quantity) || 1), 0);

      // PostgREST has no multi-statement transactions, so this runs as a
      // sequence of calls instead of a DB transaction. If something fails
      // partway through, the order row (and whatever items/inventory
      // changes already landed) stays — no automatic rollback. Same
      // trade-off already accepted elsewhere in this migration (see
      // products.js's DELETE handler).
      const { data: orderRows, error: orderInsertErr } = await supabase.from('orders').insert({
        user_id: userId,
        total,
        subtotal: body.subtotal !== undefined ? Number(body.subtotal) : (computedSubtotal || total),
        delivery_fee: body.deliveryFee !== undefined ? Number(body.deliveryFee) : 0,
        // No handling charge or GST is charged — only the product amount and delivery fee.
        coupon_code: body.couponCode || null,
        discount: body.discount !== undefined ? Number(body.discount) : 0,
        delivery_address: deliveryAddress || '',
        payment_method: paymentMethod || 'COD',
        status: isCod ? 'Preparing' : 'Paid',
        customer_name: customerName || body.customerName || 'Customer',
        customer_phone: body.customerPhone || '',
        customer_email: customerEmail || body.customerEmail || '',
        // 'Pending' isn't a valid payment status any more (only Paid/Unpaid/Failed) —
        // a fresh COD order simply hasn't been paid yet.
        payment_status: isCod ? 'Unpaid' : 'Paid',
        payment_gateway: isCod ? 'Cash on Delivery' : (body.paymentGateway || 'UPI / Online'),
        payment_txn_id: txnId,
        tracking_number: trackingNumber,
        delivery_slot: body.deliverySlot || 'Morning (7:00 AM - 10:00 AM)',
        delivery_date: body.deliveryDate || new Date().toLocaleDateString('en-IN'),
      }).select();
      throwIfError(orderInsertErr);
      const order = orderRows[0];

      if (body.couponCode) {
        try {
          const codeClean = String(body.couponCode).trim().toUpperCase();
          const discVal = Math.max(0, Number(body.discount) || 0);
          const { data: foundCoupons } = await supabase.from('coupons').select('*').eq('code', codeClean);
          if (foundCoupons?.length) {
            const cRow = foundCoupons[0];
            await supabase.from('coupons').update({
              times_used: (cRow.times_used || 0) + 1,
              total_discount_given: (cRow.total_discount_given || 0) + discVal,
            }).eq('id', cRow.id);
          }
        } catch (couponStatsErr) {
          console.warn("Failed to increment coupon stats:", couponStatsErr.message);
        }
      }

      for (const item of items) {
        // Promotional/combo offer items (added from Today's Deals / Festive
        // Offers) have no backing product row — their id looks like
        // "offer-<id>" rather than a real numeric product id. Store null
        // for those instead of forcing a bogus number through.
        let cleanProductId = parseInt(item.productId, 10);
        if (isNaN(cleanProductId)) {
          cleanProductId = parseInt(item.id, 10);
        }
        if (isNaN(cleanProductId)) {
          cleanProductId = null;
        }

        const quantity = item.qty || item.quantity || 1;

        await supabase.from('order_items').insert({
          order_id: order.id,
          product_id: cleanProductId,
          name: item.name,
          quantity,
          price: item.price,
          weight: item.weight || '',
          unit: item.unit || '',
        });

        // Deduct from tracked inventory (skip untracked/promotional items —
        // no productId, or no inventory row exists for it yet).
        if (cleanProductId != null) {
          const { data: invRows } = await supabase.from('inventory').select('*').eq('product_id', cleanProductId);
          if (invRows?.length) {
            const inv = invRows[0];
            const stockBefore = inv.available_stock;
            const stockAfter = Math.max(0, stockBefore - quantity);
            await supabase.from('inventory')
              .update({ available_stock: stockAfter, updated_at: new Date().toISOString() })
              .eq('product_id', cleanProductId);
            await supabase.from('inventory_logs').insert({
              product_id: cleanProductId,
              product_name: item.name,
              change_type: 'SUBTRACT',
              quantity,
              stock_before: stockBefore,
              stock_after: stockAfter,
              reason: `Customer order #${order.id}`,
              admin_name: 'Customer Order',
            });
            if (stockAfter === 0) {
              await supabase.from('products').update({ in_stock: false }).eq('id', cleanProductId);
            }
          }
        }
      }

      const insertedOrder = toCamelRow(order);

      // Fire email notification asynchronously (don't block HTTP response)
      sendOrderNotificationEmail(insertedOrder, items).catch(err => {
        console.error("[EMAIL ERROR] Async email send failed:", err.message);
      });

      if (customerEmail) {
        sendCustomerOrderConfirmationEmail(customerEmail, customerName, insertedOrder, items).catch(err => {
          console.error("[CUSTOMER EMAIL ERROR] Async customer email send failed:", err.message);
        });
      }

      // Fire SMS notification asynchronously (don't block HTTP response)
      sendOrderNotificationSMS(insertedOrder, items).catch(err => {
        console.error("[SMS ERROR] Async SMS send failed:", err.message);
      });

      return res.status(201).json(insertedOrder);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error("Error in /api/orders:", error?.message, error?.stack);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
