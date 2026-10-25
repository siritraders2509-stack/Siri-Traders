/**
 * useAdminApi — lightweight hook for all admin CRUD calls.
 *
 * The admin dashboard authenticates via a real httpOnly session cookie
 * (set by POST /api/admin/login) — the browser sends it automatically on
 * same-origin requests, so no secret ever needs to live in client JS.
 */

const jsonHeaders = { 'Content-Type': 'application/json' };
const withCreds = { credentials: 'include' };

async function asJson(res, fallbackError) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || fallbackError);
  return json;
}

// fetch() throws a plain TypeError ("Failed to fetch") when the request never
// got a response at all — a dropped connection, a flaky mobile network, or a
// slow upload getting cut off right before the server could reply. In that
// case the server may well have already finished the work (the image lands
// in Blob storage, the row gets inserted) even though the browser saw a
// failure. A real HTTP error (4xx/5xx) still resolves normally and is left
// alone — only this specific "no response at all" case is retried.
async function fetchWithRetry(url, options, retries = 2, delayMs = 800) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0 && err instanceof TypeError) {
      await new Promise(r => setTimeout(r, delayMs));
      return fetchWithRetry(url, options, retries - 1, delayMs * 2);
    }
    throw err;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────

export async function apiAdminLogin(email, password) {
  const res = await fetch('/api/admin/auth?action=login', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify({ email, password }),
  });
  return asJson(res, 'Login failed');
}

export async function apiAdminLogout() {
  await fetch('/api/admin/auth?action=logout', { method: 'POST', ...withCreds });
}

export async function apiAdminMe() {
  const res = await fetch('/api/admin/auth?action=me', withCreds);
  if (res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function apiChangeOwnPassword(currentPassword, newPassword) {
  const res = await fetch('/api/admin/auth?action=change-password', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return asJson(res, 'Failed to change password');
}

export async function apiFetchAdminUsers() {
  const res = await fetch('/api/admin/auth?action=admin-users', withCreds);
  if (!res.ok) throw new Error('Failed to load admins');
  return res.json();
}

export async function apiCreateAdminUser(data) {
  const res = await fetch('/api/admin/auth?action=admin-users', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to create admin');
}

// data may include { role } and/or { password } — pass whichever changed.
export async function apiUpdateAdminUser(id, data) {
  const res = await fetch(`/api/admin/auth?action=admin-users&id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update admin');
}

export async function apiDeleteAdminUser(id) {
  const res = await fetch(`/api/admin/auth?action=admin-users&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...withCreds,
  });
  return asJson(res, 'Failed to remove admin');
}

// ── Image uploads (Vercel Blob) ─────────────────────────────────────────

export async function apiUploadImage(file) {
  const res = await fetchWithRetry(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    ...withCreds,
    body: file,
  });
  const json = await asJson(res, 'Failed to upload image');
  return json.url;
}

// ── Products ─────────────────────────────────────────────────────────────

export async function apiFetchProducts(includeArchived = true) {
  const res = await fetch(`/api/products?limit=1000&includeArchived=${includeArchived}&includeUnpublished=true`);
  if (!res.ok) throw new Error('Failed to load products');
  return res.json();
}

// Surfaces the specific field(s) that failed zod validation (api/products.js
// returns { error: 'Validation failed', details: [...] }) instead of just
// the generic "Validation failed" — needed to actually see why a save failed.
async function asJsonWithValidationDetails(res, fallbackError) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (Array.isArray(json.details) && json.details.length) {
      const fields = json.details.map(d => `${(d.path || []).join('.')}: ${d.message}`).join('; ');
      throw new Error(`${json.error || fallbackError} — ${fields}`);
    }
    throw new Error(json.error || fallbackError);
  }
  return json;
}

export async function apiCreateProduct(data) {
  const res = await fetchWithRetry('/api/products', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJsonWithValidationDetails(res, 'Failed to create product');
}

export async function apiUpdateProduct(id, data) {
  const res = await fetchWithRetry(`/api/products?id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJsonWithValidationDetails(res, 'Failed to update product');
}

export async function apiDeleteProduct(id) {
  const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete product');
}

// ── Inventory Management ──────────────────────────────────────────────────

export async function apiFetchInventory() {
  const res = await fetch('/api/admin/inventory', withCreds);
  if (!res.ok) throw new Error('Failed to load inventory');
  return res.json();
}

export async function apiAdjustStock(data) {
  const res = await fetch('/api/admin/inventory?action=adjust', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to adjust stock');
}

export async function apiUpdateInventoryConfig(data) {
  const res = await fetch('/api/admin/inventory?action=config', {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update inventory settings');
}

export async function apiFetchInventoryLogs(productId) {
  const url = productId ? `/api/admin/inventory?action=logs&productId=${productId}` : '/api/admin/inventory?action=logs';
  const res = await fetch(url, withCreds);
  if (!res.ok) throw new Error('Failed to load inventory logs');
  return res.json();
}

export async function apiFetchActivityLog() {
  const res = await fetch('/api/admin/activity', withCreds);
  if (!res.ok) throw new Error('Failed to load activity log');
  return res.json();
}

// ── Orders / Users (admin) ────────────────────────────────────────────────

export async function apiFetchAllOrders() {
  const res = await fetch('/api/admin/orders', withCreds);
  if (!res.ok) throw new Error('Failed to load orders');
  return res.json();
}

export async function apiUpdateOrderStatus(id, status) {
  const res = await fetch(`/api/admin/orders?id=${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify({ status }),
  });
  return asJson(res, 'Failed to update order');
}

export async function apiUpdateOrder(id, data) {
  const res = await fetch(`/api/admin/orders?id=${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update order');
}

export async function apiFetchAllUsers() {
  const res = await fetch('/api/admin/users', withCreds);
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
}

// Pass segment: 'VIP' | 'Returning' | 'New' | 'Inactive' to manually assign
// a customer's segment, or null to clear the override and go back to auto.
export async function apiSetCustomerSegment(userId, segment) {
  const res = await fetch(`/api/admin/orders?resource=users&id=${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify({ segment }),
  });
  return asJson(res, 'Failed to update customer segment');
}

export async function apiSendBroadcast(data) {
  const res = await fetch('/api/admin/broadcast', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to send mail broadcast');
}

// ── Offers ───────────────────────────────────────────────────────────────

export async function apiFetchOffers() {
  const res = await fetch('/api/offers');
  if (!res.ok) throw new Error('Failed to load offers');
  return res.json();
}

export async function apiSaveOffer(data) {
  const res = await fetch('/api/offers', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save offer');
}

export async function apiUpdateOffer(id, data) {
  const res = await fetch(`/api/offers?id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update offer');
}

export async function apiDeleteOffer(id) {
  const res = await fetch(`/api/offers?id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete offer');
}

// ── Coupons ──────────────────────────────────────────────────────────────

export async function apiFetchCoupons() {
  const res = await fetch('/api/coupons');
  if (!res.ok) throw new Error('Failed to load coupons');
  return res.json();
}

export async function apiSaveCoupon(data) {
  const res = await fetch('/api/coupons', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save coupon');
}

export async function apiUpdateCoupon(id, data) {
  const res = await fetch(`/api/coupons?id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update coupon');
}

export async function apiDeleteCoupon(id) {
  const res = await fetch(`/api/coupons?id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete coupon');
}

// ── Delivery zones ───────────────────────────────────────────────────────

export async function apiFetchDeliveryZones() {
  const res = await fetch('/api/delivery_zones');
  if (!res.ok) throw new Error('Failed to load delivery zones');
  return res.json();
}

export async function apiSaveDeliveryZone(data) {
  const res = await fetch('/api/delivery_zones', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save delivery zone');
}

export async function apiUpdateDeliveryZone(id, data) {
  const res = await fetch(`/api/delivery_zones?id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update delivery zone');
}

export async function apiDeleteDeliveryZone(id) {
  const res = await fetch(`/api/delivery_zones?id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete delivery zone');
}

// ── Categories ───────────────────────────────────────────────────────────

export async function apiFetchCategories() {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error('Failed to load categories');
  return res.json();
}

export async function apiCreateCategory(data) {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to create category');
}

export async function apiDeleteCategory(id) {
  const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete category');
}

// ── Settings ─────────────────────────────────────────────────────────────

export async function apiFetchSettings() {
  const res = await fetch('/api/settings', withCreds);
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

export async function apiUpdateSettings(data) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update settings');
}

// ── Reviews & Ratings ───────────────────────────────────────────────────

export async function apiFetchReviews() {
  const res = await fetch('/api/admin/auth?action=reviews', withCreds);
  if (!res.ok) throw new Error('Failed to load reviews');
  return res.json();
}

export async function apiUpdateReviewStatus(id, status) {
  const res = await fetch(`/api/admin/auth?action=review-status&id=${id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify({ status }),
  });
  return asJson(res, 'Failed to update review');
}

export async function apiDeleteReview(id) {
  const res = await fetch(`/api/admin/auth?action=review-status&id=${id}`, {
    method: 'DELETE',
    ...withCreds,
  });
  return asJson(res, 'Failed to delete review');
}

// ── CMS & SEO ───────────────────────────────────────────────────────────

export async function apiFetchCmsAll() {
  const res = await fetch('/api/settings?action=cms_all', withCreds);
  if (!res.ok) throw new Error('Failed to load CMS content');
  return res.json();
}

export async function apiSaveBanner(data) {
  const res = await fetch('/api/settings?action=banner', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save banner');
}

export async function apiUpdateBanner(id, data) {
  const res = await fetch(`/api/settings?action=banner&id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update banner');
}

export async function apiDeleteBanner(id) {
  const res = await fetch(`/api/settings?action=banner&id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete banner');
}

export async function apiSavePage(data) {
  const res = await fetch('/api/settings?action=page', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save page');
}

export async function apiUpdatePage(id, data) {
  const res = await fetch(`/api/settings?action=page&id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update page');
}

export async function apiDeletePage(id) {
  const res = await fetch(`/api/settings?action=page&id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete page');
}

export async function apiSaveFaq(data) {
  const res = await fetch('/api/settings?action=faq', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save FAQ');
}

export async function apiUpdateFaq(id, data) {
  const res = await fetch(`/api/settings?action=faq&id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update FAQ');
}

export async function apiDeleteFaq(id) {
  const res = await fetch(`/api/settings?action=faq&id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete FAQ');
}

export async function apiSaveBlog(data) {
  const res = await fetch('/api/settings?action=blog', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save blog article');
}

export async function apiUpdateBlog(id, data) {
  const res = await fetch(`/api/settings?action=blog&id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update blog article');
}

export async function apiDeleteBlog(id) {
  const res = await fetch(`/api/settings?action=blog&id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete blog article');
}

export async function apiSaveRedirect(data) {
  const res = await fetch('/api/settings?action=redirect', {
    method: 'POST',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to save redirect');
}

export async function apiUpdateRedirect(id, data) {
  const res = await fetch(`/api/settings?action=redirect&id=${id}`, {
    method: 'PUT',
    headers: jsonHeaders,
    ...withCreds,
    body: JSON.stringify(data),
  });
  return asJson(res, 'Failed to update redirect');
}

export async function apiDeleteRedirect(id) {
  const res = await fetch(`/api/settings?action=redirect&id=${id}`, { method: 'DELETE', ...withCreds });
  return asJson(res, 'Failed to delete redirect');
}

// ── Hook ─────────────────────────────────────────────────────────────────
// Admin.jsx calls adminApi.xxx(), so expose named methods as a plain object.
export function useAdminApi() {
  return {
    me: apiAdminMe,
    logout: apiAdminLogout,
    changeOwnPassword: apiChangeOwnPassword,
    fetchAdminUsers: apiFetchAdminUsers,
    createAdminUser: apiCreateAdminUser,
    updateAdminUser: apiUpdateAdminUser,
    deleteAdminUser: apiDeleteAdminUser,

    uploadImage: apiUploadImage,

    fetchProducts: apiFetchProducts,
    createProduct: apiCreateProduct,
    updateProduct: apiUpdateProduct,
    deleteProduct: apiDeleteProduct,

    fetchInventory: apiFetchInventory,
    adjustStock: apiAdjustStock,
    updateInventoryConfig: apiUpdateInventoryConfig,
    fetchInventoryLogs: apiFetchInventoryLogs,
    fetchActivityLog: apiFetchActivityLog,

    fetchAllOrders: apiFetchAllOrders,
    updateOrderStatus: apiUpdateOrderStatus,
    updateOrder: apiUpdateOrder,
    fetchAllUsers: apiFetchAllUsers,
    setCustomerSegment: apiSetCustomerSegment,
    sendBroadcast: apiSendBroadcast,

    fetchOffers: apiFetchOffers,
    saveOffer: apiSaveOffer,
    updateOffer: apiUpdateOffer,
    deleteOffer: apiDeleteOffer,

    fetchCoupons: apiFetchCoupons,
    saveCoupon: apiSaveCoupon,
    updateCoupon: apiUpdateCoupon,
    deleteCoupon: apiDeleteCoupon,

    fetchReviews: apiFetchReviews,
    updateReviewStatus: apiUpdateReviewStatus,
    deleteReview: apiDeleteReview,

    fetchDeliveryZones: apiFetchDeliveryZones,
    saveDeliveryZone: apiSaveDeliveryZone,
    updateDeliveryZone: apiUpdateDeliveryZone,
    deleteDeliveryZone: apiDeleteDeliveryZone,

    fetchCategories: apiFetchCategories,
    createCategory: apiCreateCategory,
    deleteCategory: apiDeleteCategory,

    fetchSettings: apiFetchSettings,
    updateSettings: apiUpdateSettings,

    fetchCmsAll: apiFetchCmsAll,
    saveBanner: apiSaveBanner,
    updateBanner: apiUpdateBanner,
    deleteBanner: apiDeleteBanner,
    savePage: apiSavePage,
    updatePage: apiUpdatePage,
    deletePage: apiDeletePage,
    saveFaq: apiSaveFaq,
    updateFaq: apiUpdateFaq,
    deleteFaq: apiDeleteFaq,
    saveBlog: apiSaveBlog,
    updateBlog: apiUpdateBlog,
    deleteBlog: apiDeleteBlog,
    saveRedirect: apiSaveRedirect,
    updateRedirect: apiUpdateRedirect,
    deleteRedirect: apiDeleteRedirect
  };
}


