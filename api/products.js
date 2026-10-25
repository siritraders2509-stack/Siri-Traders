import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../db/supabase.js';
import { z } from 'zod';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';
import { getSessionFromRequest } from './_adminSession.js';
import { logActivity } from './admin/activity.js';

const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  weight: z.string().optional().nullable(),
  unit: z.string().optional().nullable().default('g'),
  packSize: z.string().optional().nullable(),
  price: z.number().nonnegative(),
  mrp: z.number().nonnegative().optional().nullable(),
  costPrice: z.number().nonnegative().optional().nullable(),
  discount: z.number().nonnegative().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  mfgDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  // Images must be uploaded to Blob storage and referenced by URL. An inline
  // data: URI bloats every /api/products response for every visitor.
  image: z.string().refine(v => !v.startsWith('data:'), 'Upload the image instead of pasting image data').optional().nullable(),
  description: z.string().optional().nullable(),
  inStock: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  deliveryTime: z.string().optional().nullable(),
  isBestseller: z.boolean().optional(),
  isTodaysDeal: z.boolean().optional(),
  wholesalePrice: z.number().nonnegative().optional().nullable(),
  bulkPackLabel: z.string().optional().nullable(),
  bulkPackPrice: z.number().nonnegative().optional().nullable(),
  wholesaleCaseLabel: z.string().optional().nullable(),
  wholesaleCasePrice: z.number().nonnegative().optional().nullable(),
  targetType: z.string().optional().nullable().default('retail_and_wholesale'),
  variants: z.array(z.any()).optional().nullable(),
  siblingGroup: z.string().max(64).optional().nullable()
});

const productUpdateSchema = productSchema.partial();

function normalizeProductPayload(body) {
  if (!body || typeof body !== 'object') return {};
  const payload = { ...body };

  delete payload.id;
  delete payload.stockNote;
  delete payload.createdAt;
  delete payload.updatedAt;

  const numFields = ['price', 'mrp', 'costPrice', 'discount', 'wholesalePrice', 'bulkPackPrice', 'wholesaleCasePrice'];
  for (const field of numFields) {
    if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
      const parsed = Number(payload[field]);
      if (!isNaN(parsed)) {
        payload[field] = Math.round(parsed);
      }
    } else if (payload[field] === '') {
      payload[field] = null;
    }
  }

  return payload;
}

// Legacy rows may still hold an inline data: URI image. Never ship those inside
// JSON lists (one row was 83% of the whole payload); point at a cacheable
// binary image endpoint instead.
const slimImage = (p) => (
  typeof p.image === 'string' && p.image.startsWith('data:')
    ? { ...p, image: `/api/products?resource=image&id=${p.id}` }
    : p
);

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id, resource, action } = req.query;
  const supabase = getSupabase();

  try {
    // ── Product image as binary: /api/products?resource=image&id=:id
    if (resource === 'image' && id && req.method === 'GET') {
      const { data, error } = await supabase.from('products').select('image').eq('id', parseInt(id, 10)).maybeSingle();
      throwIfError(error);
      const m = /^data:([^;]+);base64,(.+)$/s.exec(data?.image || '');
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).send(Buffer.from(m[2], 'base64'));
    }

    // ── Categories sub-resource: /api/categories or /api/products?resource=categories
    if (resource === 'categories' || action === 'categories') {
      if (!id) {
        if (req.method === 'GET') {
          const { data, error } = await supabase.from('categories').select('*');
          throwIfError(error);
          res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
          return res.status(200).json(toCamelRows(data));
        }

        if (req.method === 'POST') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const name = String(body.name || '').trim();
          if (!name) return res.status(400).json({ error: 'name is required' });
          if (String(body.image || '').startsWith('data:')) {
            return res.status(400).json({ error: 'Upload the image instead of pasting image data' });
          }

          const catId = body.id || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          const { data, error } = await supabase.from('categories').insert({
            id: catId,
            name,
            image: body.image || '',
            color: body.color || '#F1F8E9',
            item_count: 0
          }).select();
          throwIfError(error);

          return res.status(201).json(toCamelRow(data[0]));
        }
      } else {
        if (req.method === 'DELETE') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const catId = String(id).trim();
          const { data: targetCat } = await supabase.from('categories').select('name').eq('id', catId).maybeSingle();
          const catName = targetCat?.name;

          // No cascading product deletion — refuse if the category still
          // has products, same as the main /api/categories route.
          const countQuery = catName
            ? supabase.from('products').select('id', { count: 'exact', head: true }).or(`category.eq.${catId},category.eq.${catName}`)
            : supabase.from('products').select('id', { count: 'exact', head: true }).eq('category', catId);
          const { count: productCount } = await countQuery;
          if (productCount > 0) {
            return res.status(400).json({
              error: `This category still has ${productCount} product${productCount === 1 ? '' : 's'} in it. Move or delete them first, then delete the category.`,
            });
          }

          const { error } = await supabase.from('categories').delete().eq('id', catId);
          throwIfError(error);
          return res.status(200).json({ success: true, id: catId });
        }
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Bulk CSV import: /api/products?resource=bulk-import ────────────
    // Built after a category delete wiped ~200 manually-entered products
    // with no way to get them back — so re-entering a large batch (from a
    // spreadsheet or supplier list) is a single upload instead of hundreds
    // of individual forms. Every row is validated and inserted on its own,
    // so one bad row doesn't block the rest, and the admin gets a precise
    // per-row report of what succeeded and what didn't (and why).
    if (resource === 'bulk-import') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const rows = Array.isArray(body?.products) ? body.products : null;
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: 'No product rows provided' });
      }
      if (rows.length > 2000) {
        return res.status(400).json({ error: 'Too many rows in one import (max 2000) — split into smaller files' });
      }

      const { data: existingCats } = await supabase.from('categories').select('id, name');
      const catIds = new Set((existingCats || []).map(c => c.id));
      const catByName = new Map((existingCats || []).map(c => [String(c.name).toLowerCase(), c.id]));
      const createdCategoryIds = new Set();

      const results = [];
      let successCount = 0;
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // +1 for 0-index, +1 for the CSV header row
        const raw = normalizeProductPayload(rows[i]);

        // A CSV category column holds either an existing category's id or
        // its display name — resolve it to an id, auto-creating a new
        // category from the name if neither matches anything on file.
        if (raw.category) {
          const catInput = String(raw.category).trim();
          if (!catIds.has(catInput)) {
            const byName = catByName.get(catInput.toLowerCase());
            if (byName) {
              raw.category = byName;
            } else {
              const newCatId = catInput.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `cat-${Date.now()}-${i}`;
              if (!catIds.has(newCatId)) {
                const { error: catErr } = await supabase.from('categories').insert({ id: newCatId, name: catInput, image: '', color: '#F1F8E9', item_count: 0 });
                if (!catErr) {
                  catIds.add(newCatId);
                  catByName.set(catInput.toLowerCase(), newCatId);
                  createdCategoryIds.add(newCatId);
                }
              }
              raw.category = newCatId;
            }
          }
        }

        const validation = productSchema.safeParse(raw);
        if (!validation.success) {
          results.push({ row: rowNum, name: raw.name || '(no name)', success: false, error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') });
          continue;
        }

        const { error } = await supabase.from('products').insert(toSnakeRow(validation.data));
        if (error) {
          results.push({ row: rowNum, name: raw.name, success: false, error: error.message });
        } else {
          successCount++;
          results.push({ row: rowNum, name: raw.name, success: true });
        }
      }

      const session = getSessionFromRequest(req);
      await logActivity(supabase, {
        action: 'BULK_IMPORT',
        entityType: 'product',
        entityName: `${successCount} of ${rows.length} rows`,
        adminName: session?.name || session?.email,
        details: { successCount, failCount: rows.length - successCount, createdCategoryIds: [...createdCategoryIds] },
      });

      return res.status(200).json({ successCount, failCount: rows.length - successCount, results });
    }

    // ── Products Collection: /api/products ─────────────────────────────
    if (!id) {
      if (req.method === 'GET') {
        const { category, includeArchived, includeUnpublished } = req.query;
        let limitVal = parseInt(req.query.limit, 10);
        let offsetVal = parseInt(req.query.offset, 10);

        if (Number.isNaN(limitVal)) limitVal = 500;
        if (Number.isNaN(offsetVal)) offsetVal = 0;

        const parsedLimit = Math.min(1000, Math.max(1, limitVal));
        const parsedOffset = Math.max(0, offsetVal);

        let query = supabase.from('products').select('*');

        if (category) {
          query = query.eq('category', category);
        }
        if (includeArchived !== 'true') {
          query = query.eq('is_archived', false);
        }
        // Public/storefront requests only see published products.
        // Admin fetches pass includeUnpublished=true to see everything.
        if (includeUnpublished !== 'true') {
          query = query.eq('is_published', true);
        }

        const { data, error } = await query.range(parsedOffset, parsedOffset + parsedLimit - 1);
        throwIfError(error);

        // Storefront lists are cached at the edge for a short window so a
        // newly-saved product shows up quickly (worst case ~40s); admin lists
        // (archived/unpublished included) always hit the DB.
        const isAdminList = includeArchived === 'true' || includeUnpublished === 'true';
        res.setHeader('Cache-Control', isAdminList
          ? 'private, no-store'
          : 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
        return res.status(200).json(toCamelRows(data).map(slimImage));
      }


      if (req.method === 'POST') {
        const adminOk = await isAdminRequest(req);
        if (!adminOk) {
          return res.status(403).json({ error: 'Forbidden: admin access required' });
        }

        const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const body = normalizeProductPayload(rawBody);
        const validationResult = productSchema.safeParse(body);
        if (!validationResult.success) {
          return res.status(400).json({ error: 'Validation failed', details: validationResult.error.errors });
        }

        const { data, error } = await supabase.from('products').insert(toSnakeRow(validationResult.data)).select();
        throwIfError(error);
        return res.status(201).json(toCamelRow(data[0]));
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Product Item: /api/products?id=:id ─────────────────────────────
    const parsedId = parseInt(id, 10);
    if (Number.isNaN(parsedId) || parsedId <= 0) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('products').select('*').eq('id', parsedId).maybeSingle();
      throwIfError(error);
      if (!data) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(200).json(slimImage(toCamelRow(data)));
    }

    if (req.method === 'PUT') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const body = normalizeProductPayload(rawBody);
      const validation = productUpdateSchema.safeParse(body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
      }

      const { data: existing } = await supabase.from('products').select('id').eq('id', parsedId).maybeSingle();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const { data, error } = await supabase.from('products').update(toSnakeRow(validation.data)).eq('id', parsedId).select();
      throwIfError(error);

      return res.status(200).json(toCamelRow(data[0]));
    }

    if (req.method === 'DELETE') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const { data: existing } = await supabase.from('products').select('id, name').eq('id', parsedId).maybeSingle();
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      try {
        // PostgREST has no multi-statement transaction — these run
        // sequentially instead. Same practical effect since the first
        // three were already best-effort (wrapped to ignore failures).
        await supabase.from('order_items').update({ product_id: null }).eq('product_id', parsedId);
        await supabase.from('reviews').update({ product_id: null }).eq('product_id', parsedId);
        await supabase.from('inventory').delete().eq('product_id', parsedId);
        const { error } = await supabase.from('products').delete().eq('id', parsedId);
        throwIfError(error);

        const session = getSessionFromRequest(req);
        await logActivity(supabase, {
          action: 'DELETE',
          entityType: 'product',
          entityId: parsedId,
          entityName: existing.name,
          adminName: session?.name || session?.email,
        });

        return res.status(200).json({ success: true, id: parsedId });
      } catch (delErr) {
        console.error('Error deleting product from database:', delErr);
        return res.status(500).json({ error: `Failed to delete product: ${delErr.message}` });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Database error in /api/products:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
