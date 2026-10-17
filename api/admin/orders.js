import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../../db/supabase.js';
import { setCorsHeaders } from '../_cors.js';
import { isAdminRequest } from '../_adminAuth.js';
import { sendCustomerOrderStatusUpdateEmail, sendViaResend } from '../_email.js';
import { sendCustomerOrderStatusSMS, sendBulkPromotionalSMS } from '../_sms.js';

const VALID_STATUSES = ['Preparing', 'In Transit', 'Delivered', 'Paid', 'Cancelled'];
const VALID_PAYMENT_STATUSES = ['Paid', 'Unpaid', 'Failed', 'Refunded', 'Partially Refunded'];
const VALID_RETURN_STATUSES = ['None', 'Requested', 'Approved', 'Picked Up', 'Refunded', 'Rejected'];

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const adminOk = await isAdminRequest(req);
  if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { id, resource, action } = req.query;
  const supabase = getSupabase();

  try {
    // ── 1. Users & Customer Segmentation: ?resource=users or ?action=users ─────
    if (resource === 'users' || action === 'users') {
      // Item: /api/admin/orders?resource=users&id=<userId> — manually assign
      // (or clear) a customer's segment instead of relying on the auto rules.
      if (id) {
        if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const allowedSegments = ['VIP', 'Returning', 'New', 'Inactive'];
        const requested = body.segment;
        if (requested !== null && !allowedSegments.includes(requested)) {
          return res.status(400).json({ error: `Invalid segment. Valid: ${allowedSegments.join(', ')}, or null to reset to auto` });
        }

        const { data: updated, error } = await supabase.from('users')
          .update({ segment_override: requested, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select();
        throwIfError(error);
        if (!updated.length) return res.status(404).json({ error: 'Customer not found' });

        return res.status(200).json(toCamelRow(updated[0]));
      }

      if (req.method === 'GET') {
        const { data: usersRaw, error: usersErr } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        throwIfError(usersErr);
        const { data: ordersRaw, error: ordersErr } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        throwIfError(ordersErr);
        const { data: itemsRaw, error: itemsErr } = await supabase.from('order_items').select('*');
        throwIfError(itemsErr);

        const allUsers = toCamelRows(usersRaw);
        const allOrders = toCamelRows(ordersRaw);
        const allItems = toCamelRows(itemsRaw);

        const itemsByOrderId = new Map();
        for (const it of allItems) {
          if (!itemsByOrderId.has(it.orderId)) {
            itemsByOrderId.set(it.orderId, []);
          }
          itemsByOrderId.get(it.orderId).push(it);
        }

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const enrichedUsers = allUsers.map(user => {
          const userOrders = allOrders
            .filter(o => o.userId === user.id)
            .map(o => ({
              ...o,
              items: itemsByOrderId.get(o.id) || []
            }));

          const totalSpent = userOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
          const orderCount = userOrders.length;
          const aov = orderCount > 0 ? Math.round(totalSpent / orderCount) : 0;

          const lastOrder = userOrders[0];
          const firstOrder = userOrders[userOrders.length - 1];
          const lastOrderDate = lastOrder ? new Date(lastOrder.createdAt) : null;
          const firstOrderDate = firstOrder ? new Date(firstOrder.createdAt) : null;

          let autoSegment = 'New';
          if (orderCount >= 5 || totalSpent >= 5000) {
            autoSegment = 'VIP';
          } else if (orderCount >= 2) {
            autoSegment = lastOrderDate && lastOrderDate < thirtyDaysAgo ? 'Inactive' : 'Returning';
          } else if (orderCount === 1) {
            autoSegment = lastOrderDate && lastOrderDate < thirtyDaysAgo ? 'Inactive' : 'New';
          } else {
            autoSegment = 'Inactive';
          }

          return {
            ...user,
            ordersCount: orderCount,
            totalSpent,
            averageOrderValue: aov,
            // An admin-assigned segment (via PATCH ...&id=) always wins over
            // the auto-computed one; autoSegment/segmentOverride are both
            // still exposed so the UI can show what "Auto" would pick.
            segment: user.segmentOverride || autoSegment,
            autoSegment,
            lastOrderDate: lastOrderDate ? lastOrderDate.toISOString() : null,
            firstOrderDate: firstOrderDate ? firstOrderDate.toISOString() : null,
            orderHistory: userOrders
          };
        });

        return res.status(200).json(enrichedUsers);
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── 2. Promotional Broadcast (Email or SMS): ?resource=broadcast or ?action=broadcast ──
    if (resource === 'broadcast' || action === 'broadcast') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { subject, messageText, recipients: bodyRecipients, channel } = body;

      if (!messageText || (channel !== 'sms' && !subject)) {
        return res.status(400).json({ error: channel === 'sms' ? 'Message text is required' : 'Subject and message text are required' });
      }

      // ── SMS channel: recipients are resolved to phone numbers ────────────
      if (channel === 'sms') {
        let phones = [];
        if (Array.isArray(bodyRecipients) && bodyRecipients.length > 0) {
          // bodyRecipients may already be phone numbers, or emails selected
          // from the customer picker — resolve emails to phone numbers.
          const looksLikeEmail = bodyRecipients.some(r => String(r).includes('@'));
          if (looksLikeEmail) {
            const { data: allUsersRaw } = await supabase.from('users').select('email, phone');
            const emailToPhone = new Map((allUsersRaw || []).map(u => [u.email, u.phone]));
            phones = bodyRecipients.map(r => emailToPhone.get(r)).filter(Boolean);
          } else {
            phones = bodyRecipients.filter(Boolean);
          }
        } else {
          const { data: allUsersRaw } = await supabase.from('users').select('phone');
          phones = (allUsersRaw || []).map(u => u.phone).filter(Boolean);
        }

        if (phones.length === 0) {
          return res.status(200).json({ success: true, count: 0, message: 'No recipients with a phone number available.' });
        }

        const smsResult = await sendBulkPromotionalSMS(phones, messageText);
        if (!smsResult.success) {
          return res.status(500).json({ error: 'Failed to send SMS broadcast. Check MSG91 credentials.' });
        }

        return res.status(200).json({ success: true, count: smsResult.count });
      }

      let recipients = [];
      if (Array.isArray(bodyRecipients) && bodyRecipients.length > 0) {
        recipients = bodyRecipients.filter(Boolean);
      } else {
        const { data: allUsersRaw } = await supabase.from('users').select('email');
        recipients = (allUsersRaw || []).map(u => u.email).filter(Boolean);
      }

      if (recipients.length === 0) {
        return res.status(200).json({ success: true, count: 0, message: 'No recipients available.' });
      }

      if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });
      }

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #faf9f6;">
          <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2d5016;">
            <h1 style="color: #2d5016; margin: 0; font-size: 24px; letter-spacing: 0.5px;">SIRI TRADERS</h1>
            <p style="color: #687466; margin: 4px 0 0; font-size: 13px;">Fast & Reliable Grocery Delivery</p>
          </div>
          <div style="color: #1f2937; font-size: 15px; line-height: 1.6; padding: 10px 0;">
            ${messageText.replace(/\n/g, '<br />')}
          </div>
          <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
            <a href="https://www.siritrader.com" style="display: inline-block; background-color: #2d5016; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Visit Our Store</a>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 20px;">
              H.No 10-152, Nagarjuna Colony Road No 12, Chitkul, Isnapur Municipality, Hyderabad — 502307<br />
              You are receiving this email because you are a registered user of Siri Traders.
            </p>
          </div>
        </div>
      `;

      const sent = recipients.length === 1
        ? await sendViaResend({ to: recipients[0], subject, html: htmlContent })
        : await sendViaResend({ to: process.env.RESEND_FROM || recipients[0], bcc: recipients, subject, html: htmlContent });

      if (!sent) {
        return res.status(500).json({ error: 'Failed to send broadcast email. Check RESEND_API_KEY.' });
      }

      return res.status(200).json({ success: true, count: recipients.length });
    }

    // ── 3. Orders Collection: GET /api/admin/orders ─────────────────────
    if (!id) {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { data: ordersRaw, error: ordersErr } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      throwIfError(ordersErr);
      const { data: itemsRaw, error: itemsErr } = await supabase.from('order_items').select('*');
      throwIfError(itemsErr);
      const { data: usersRaw, error: usersErr } = await supabase.from('users').select('*');
      throwIfError(usersErr);

      const allOrders = toCamelRows(ordersRaw);
      const allItems = toCamelRows(itemsRaw);
      const allUsers = toCamelRows(usersRaw);

      const userMap = new Map(allUsers.map(u => [u.id, u]));

      const ordersWithDetails = allOrders.map(order => {
        const user = userMap.get(order.userId);
        const items = allItems.filter(item => item.orderId === order.id);
        return {
          ...order,
          customerName: order.customerName || user?.name || 'Customer',
          customerPhone: order.customerPhone || user?.phone || '',
          customerEmail: order.customerEmail || user?.email || '',
          items
        };
      });

      return res.status(200).json(ordersWithDetails);
    }

    // ── 4. Single Order Item: /api/admin/orders?id=:id ───────────────────
    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId) || parsedId <= 0) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    if (req.method === 'GET') {
      const { data: orderRaw, error: orderErr } = await supabase.from('orders').select('*').eq('id', parsedId).maybeSingle();
      throwIfError(orderErr);
      if (!orderRaw) return res.status(404).json({ error: 'Order not found' });
      const order = toCamelRow(orderRaw);

      const { data: itemsRaw } = await supabase.from('order_items').select('*').eq('order_id', parsedId);
      const { data: userRaw } = await supabase.from('users').select('*').eq('id', order.userId).maybeSingle();
      const user = userRaw ? toCamelRow(userRaw) : null;

      return res.status(200).json({
        ...order,
        customerName: order.customerName || user?.name || 'Customer',
        customerPhone: order.customerPhone || user?.phone || '',
        customerEmail: order.customerEmail || user?.email || '',
        items: toCamelRows(itemsRaw)
      });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { data: orderRaw, error: orderErr } = await supabase.from('orders').select('*').eq('id', parsedId).maybeSingle();
      throwIfError(orderErr);
      if (!orderRaw) return res.status(404).json({ error: 'Order not found' });

      const currentOrder = toCamelRow(orderRaw);
      const updateData = {};

      if (body.status !== undefined) {
        if (!VALID_STATUSES.includes(body.status)) {
          return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
        }
        updateData.status = body.status;
        if (body.status === 'Cancelled' && !currentOrder.cancelledAt) {
          updateData.cancelledAt = new Date().toISOString();
          if (body.cancellationReason) updateData.cancellationReason = body.cancellationReason;
        }
        if (body.paymentStatus === undefined) {
          if (body.status === 'Delivered' && currentOrder.paymentStatus !== 'Paid') {
            updateData.paymentStatus = 'Paid';
          } else if (currentOrder.status === 'Delivered' && (body.status === 'Preparing' || body.status === 'Cancelled')) {
            updateData.paymentStatus = 'Unpaid';
          }
        }
      }

      if (body.paymentStatus !== undefined) {
        if (!VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
          return res.status(400).json({ error: `Invalid paymentStatus. Valid: ${VALID_PAYMENT_STATUSES.join(', ')}` });
        }
        updateData.paymentStatus = body.paymentStatus;
      }

      if (body.paymentGateway !== undefined) updateData.paymentGateway = body.paymentGateway;
      if (body.paymentTxnId !== undefined) updateData.paymentTxnId = body.paymentTxnId;
      if (body.orderNotes !== undefined) updateData.orderNotes = body.orderNotes;
      if (body.deliverySlot !== undefined) updateData.deliverySlot = body.deliverySlot;
      if (body.deliveryDate !== undefined) updateData.deliveryDate = body.deliveryDate;
      if (body.trackingNumber !== undefined) updateData.trackingNumber = body.trackingNumber;
      if (body.deliveryPartner !== undefined) updateData.deliveryPartner = body.deliveryPartner;

      // Handle Refunds
      if (body.refundAmount !== undefined && Number(body.refundAmount) > 0) {
        const refAmt = Number(body.refundAmount);
        const totalRef = (currentOrder.refundAmount || 0) + refAmt;
        updateData.refundAmount = totalRef;
        updateData.refundReason = body.refundReason || 'Admin processed refund';
        updateData.refundedAt = new Date().toISOString();
        updateData.paymentStatus = totalRef >= currentOrder.total ? 'Refunded' : 'Partially Refunded';
      }

      // Handle Returns
      if (body.returnStatus !== undefined) {
        if (!VALID_RETURN_STATUSES.includes(body.returnStatus)) {
          return res.status(400).json({ error: `Invalid returnStatus. Valid: ${VALID_RETURN_STATUSES.join(', ')}` });
        }
        updateData.returnStatus = body.returnStatus;
        if (body.returnReason) updateData.returnReason = body.returnReason;
      }

      // Restock inventory on cancellation or return approval if requested
      if (body.restockOnCancel) {
        try {
          const { data: itemsRaw } = await supabase.from('order_items').select('*').eq('order_id', parsedId);
          for (const item of toCamelRows(itemsRaw)) {
            if (item.productId) {
              const { data: invRaw } = await supabase.from('inventory').select('*').eq('product_id', item.productId).maybeSingle();
              if (invRaw) {
                const currentStock = invRaw.available_stock || 0;
                const newStock = currentStock + (item.quantity || 1);
                await supabase.from('inventory').update({ available_stock: newStock }).eq('product_id', item.productId);
                await supabase.from('inventory_logs').insert({
                  product_id: item.productId,
                  product_name: item.name,
                  change_type: 'RETURN',
                  quantity: item.quantity || 1,
                  stock_before: currentStock,
                  stock_after: newStock,
                  reason: `Order #${parsedId} Cancelled / Restocked`,
                  notes: body.cancellationReason || body.returnReason || '',
                  admin_name: 'Admin Control Center',
                });
              }
            }
          }
        } catch (restockErr) {
          console.warn('Restock warning:', restockErr.message);
        }
      }

      const { data: updatedRaw, error: updErr } = await supabase.from('orders')
        .update(toSnakeRow(updateData))
        .eq('id', parsedId)
        .select();
      throwIfError(updErr);
      const updated = toCamelRow(updatedRaw[0]);

      if (body.status && body.status !== currentOrder.status) {
        try {
          const { data: customerRaw } = await supabase.from('users').select('*').eq('id', currentOrder.userId).maybeSingle();
          const customer = customerRaw ? toCamelRow(customerRaw) : null;
          if (customer) {
            if (customer.email) {
              sendCustomerOrderStatusUpdateEmail(customer.email, customer.name, updated, body.status).catch(err => {
                console.error("[EMAIL ERROR] Customer status email failed:", err.message);
              });
            }
            if (customer.phone) {
              sendCustomerOrderStatusSMS(customer.phone, customer.name, updated, body.status).catch(err => {
                console.error("[SMS ERROR] Customer status SMS failed:", err.message);
              });
            }
          }
        } catch (err) {
          console.warn("Failed to send customer status updates:", err.message);
        }
      }

      const { data: itemsRaw } = await supabase.from('order_items').select('*').eq('order_id', parsedId);
      return res.status(200).json({ ...updated, items: toCamelRows(itemsRaw) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/admin/orders:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
