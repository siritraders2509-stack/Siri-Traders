import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSupabase, toCamelRow, toCamelRows, throwIfError } from '../../db/supabase.js';
import { setCorsHeaders } from '../_cors.js';
import { isAdminRequest } from '../_adminAuth.js';
import { getAuthenticatedUserId, clerk } from '../_clerkAuth.js';
import { signAdminSession, setSessionCookie, clearSessionCookie, getSessionFromRequest } from '../_adminSession.js';
import { sendAdminWelcomeEmail, sendAdminPasswordChangedEmail } from '../_email.js';

// Must match ADMIN_ROLE_PERMISSIONS in frontend/src/pages/Admin.jsx — any
// role outside this list gets no tabs there, so reject it here too.
const ADMIN_ROLES = ['Owner', 'Super Admin', 'Product Manager', 'Order Manager', 'Marketing Manager', 'Content Manager', 'Customer Support', 'Viewer'];

const createAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ADMIN_ROLES).optional()
});

const updateAdminSchema = z.object({
  role: z.enum(ADMIN_ROLES).optional(),
  password: z.string().min(8).optional()
}).refine(data => data.role !== undefined || data.password !== undefined, {
  message: 'Provide at least a role or a password to update'
});

async function handleLogin(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data: admin, error } = await supabase.from('admin_users').select('*').eq('email', email).maybeSingle();
  throwIfError(error);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid admin email or password' });
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid admin email or password' });
  }

  const token = signAdminSession({ sub: admin.id, email: admin.email, name: admin.name, role: admin.role });
  setSessionCookie(req, res, token);

  return res.status(200).json({ name: admin.name, email: admin.email, role: admin.role });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  clearSessionCookie(req, res);
  return res.status(200).json({ success: true });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  return res.status(200).json({ name: session.name, email: session.email, role: session.role });
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

// Self-service password change — requires a real session cookie (not the
// x-admin-secret header, since this must be the account's own owner) and
// proof of the current password, unlike the Owner-only admin-users PATCH
// which resets someone else's password without knowing the old one.
async function handleChangePassword(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const validation = changePasswordSchema.safeParse(body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
  }
  const { currentPassword, newPassword } = validation.data;

  const { data: admin, error } = await supabase.from('admin_users').select('*').eq('id', session.sub).maybeSingle();
  throwIfError(error);
  if (!admin) return res.status(404).json({ error: 'Admin account not found' });

  const passwordMatches = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { error: updErr } = await supabase.from('admin_users').update({ password_hash: passwordHash }).eq('id', session.sub);
  throwIfError(updErr);

  const emailSent = await sendAdminPasswordChangedEmail(toCamelRow(admin), newPassword);
  return res.status(200).json({ success: true, emailSent });
}

async function handleAdminUsers(req, res, supabase) {
  const adminOk = await isAdminRequest(req);
  if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('admin_users').select('*');
    throwIfError(error);
    const safe = toCamelRows(data).map(({ passwordHash, ...rest }) => rest);
    return res.status(200).json(safe);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Admin user id is required' });

    const session = getSessionFromRequest(req);
    if (session && session.sub === id) {
      return res.status(400).json({ error: 'You cannot remove your own admin account' });
    }

    const { error } = await supabase.from('admin_users').delete().eq('id', id);
    throwIfError(error);
    return res.status(200).json({ success: true, id });
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Admin user id is required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const validation = updateAdminSchema.safeParse(body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
    }

    const { role, password } = validation.data;
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (password !== undefined) updateData.password_hash = await bcrypt.hash(password, 10);

    const { data: updated, error } = await supabase.from('admin_users').update(updateData).eq('id', id).select();
    throwIfError(error);
    if (!updated.length) return res.status(404).json({ error: 'Admin user not found' });

    let emailSent = null;
    if (password !== undefined) {
      emailSent = await sendAdminPasswordChangedEmail(toCamelRow(updated[0]), password);
    }

    const { passwordHash: _omit, ...safe } = toCamelRow(updated[0]);
    return res.status(200).json({ ...safe, emailSent });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const validation = createAdminSchema.safeParse(body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
    }

    const { name, email, password, role } = validation.data;
    const normalizedEmail = email.trim().toLowerCase();
    const finalRole = role || 'Viewer';
    const passwordHash = await bcrypt.hash(password, 10);
    const id = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: inserted, error } = await supabase.from('admin_users').insert({
      id,
      name,
      email: normalizedEmail,
      password_hash: passwordHash,
      role: finalRole,
    }).select();
    throwIfError(error);

    const emailSent = await sendAdminWelcomeEmail(toCamelRow(inserted[0]), password);

    const { passwordHash: _omit, ...safe } = toCamelRow(inserted[0]);
    return res.status(201).json({ ...safe, emailSent });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleReviews(req, res, supabase) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
    throwIfError(error);
    return res.status(200).json(toCamelRows(data));
  }

  if (req.method === 'POST') {
    // Reviews are customer-submitted, so this needs a real signed-in user —
    // not an admin session. userId/userName come from the verified Clerk
    // token, never trusted from the request body.
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Please sign in to leave a review.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    // Combo/festive-offer line items have no real productId — orderItemId
    // (the purchased line item's own id) anchors the review in that case.
    const productId = body?.productId ? Number(body.productId) : null;
    const orderItemId = body?.orderItemId ? Number(body.orderItemId) : null;
    const rating = Number(body?.rating);
    if ((!productId && !orderItemId) || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'productId or orderItemId, and a rating between 1 and 5, are required' });
    }

    // Only reviewable if this user actually has a delivered order containing this item.
    // A specific purchased line item (orderItemId) is preferred so each order
    // can be reviewed separately; productId alone falls back to the first match.
    const { data: deliveredOrders } = await supabase.from('orders').select('id').eq('user_id', userId).eq('status', 'Delivered');
    let purchasedItem = null;
    if (deliveredOrders?.length) {
      const orderIds = deliveredOrders.map(o => o.id);
      let itemQuery = supabase.from('order_items').select('*').in('order_id', orderIds);
      itemQuery = orderItemId ? itemQuery.eq('id', orderItemId) : itemQuery.eq('product_id', productId);
      const { data: items } = await itemQuery;
      purchasedItem = items?.[0] || null;
    }
    if (!purchasedItem) {
      return res.status(403).json({ error: 'You can only review items from your delivered orders.' });
    }

    // One review per purchased line item, so re-ordering the same product
    // later lets the customer review that new order too.
    const { data: alreadyReviewed } = await supabase.from('reviews').select('id').eq('user_id', userId).eq('order_item_id', purchasedItem.id);
    if (alreadyReviewed?.length) {
      return res.status(409).json({ error: 'You have already reviewed this item from this order.' });
    }

    let userName = 'Customer';
    try {
      const clerkUser = await clerk.users.getUser(userId);
      userName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim()
        || clerkUser.emailAddresses[0]?.emailAddress
        || 'Customer';
    } catch { /* keep default name */ }

    const { data: inserted, error } = await supabase.from('reviews').insert({
      product_id: productId || purchasedItem.product_id || null,
      order_item_id: purchasedItem.id,
      product_name: purchasedItem.name || (productId ? `Product #${productId}` : 'Item'),
      user_id: userId,
      user_name: userName,
      rating,
      title: body?.title || '',
      comment: body?.comment || '',
      status: 'Approved',
    }).select();
    throwIfError(error);

    return res.status(201).json(toCamelRow(inserted[0]));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleReviewUpdate(req, res, supabase) {
  const adminOk = await isAdminRequest(req);
  if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Review ID is required' });

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { data, error } = await supabase.from('reviews').update({
      status: body.status || 'Approved',
    }).eq('id', Number(id)).select();
    throwIfError(error);

    return res.status(200).json(toCamelRow(data[0]));
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('reviews').delete().eq('id', Number(id));
    throwIfError(error);
    return res.status(200).json({ success: true, id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;
  const supabase = getSupabase();

  try {
    if (action === 'login') return await handleLogin(req, res, supabase);
    if (action === 'logout') return await handleLogout(req, res);
    if (action === 'change-password') return await handleChangePassword(req, res, supabase);
    if (action === 'me') return await handleMe(req, res);
    if (action === 'admin-users') return await handleAdminUsers(req, res, supabase);
    if (action === 'reviews') return await handleReviews(req, res, supabase);
    if (action === 'review-status' || action === 'update-review') return await handleReviewUpdate(req, res, supabase);
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'An admin with that email already exists' });
    }
    console.error(`Error in /api/admin/auth (action=${action}):`, error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
