import { getSupabase, toSnakeRow, toCamelRow, toCamelRows, throwIfError } from '../db/supabase.js';
import { setCorsHeaders } from './_cors.js';
import { isAdminRequest } from './_adminAuth.js';

const DEFAULTS = {
  id: 'default',
  deliveryFee: 25,
  freeDeliveryThreshold: 500,
  minOrderValue: 0,
  announcementText: '⚡ Free 15-min delivery across Hyderabad on orders above ₹499!',
  announcementBg: '#1C4B12',
  announcementColor: '#FFFFFF',
  announcementLink: '/categories',
  announcementActive: true,
  metaTitle: 'Siri Traders — Fresh Groceries & Wholesale Supermarket in Hyderabad',
  metaDescription: 'Order fresh groceries, premium basmati rice, unpolished pulses, cold-pressed edible oils, and daily essentials online from Siri Traders with fast 15-minute delivery.',
  canonicalUrl: 'https://www.siritrader.com',
  ogImage: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80',
  robotsIndex: true,
  googleSiteVerification: 'google-site-verification-siri-traders-2026',
  schemaJson: '{"@context":"https://schema.org","@type":"GroceryStore","name":"Siri Traders","image":"https://www.siritrader.com/logo-mark.webp","telephone":"+919849012345","priceRange":"₹₹","address":{"@type":"PostalAddress","streetAddress":"Kukatpally Main Road","addressLocality":"Hyderabad","addressRegion":"Telangana","postalCode":"500072","addressCountry":"IN"}}',
  sitemapEnabled: true,
  homeSections: {
    todaysDeals: true,
    bestsellers: true,
    dailyOffers: true,
    festiveOffers: true,
    shopByCategory: true,
    categories: {}
  }
};

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, resource, id } = req.query;
  const supabase = getSupabase();

  try {
    // ── Delivery Zones Sub-handler: /api/delivery_zones or ?resource=delivery_zones
    if (resource === 'delivery_zones' || action === 'delivery_zones') {
      if (!id) {
        if (req.method === 'GET') {
          const { data, error } = await supabase.from('delivery_zones').select('*');
          throwIfError(error);
          return res.status(200).json(toCamelRows(data));
        }

        if (req.method === 'POST') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          if (!body.area || !body.pincode) {
            return res.status(400).json({ error: 'area and pincode are required' });
          }

          const zoneId = body.id || `zone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const values = {
            id: String(zoneId),
            area: body.area,
            pincode: String(body.pincode),
            time: body.time || '30 mins',
            distance: body.distance || '',
            active: body.active !== false,
            deliveryFee: Number(body.deliveryFee) || 0,
            freeDeliveryThreshold: Number(body.freeDeliveryThreshold) || 0,
            minOrderValue: Number(body.minOrderValue) || 0,
            deliverySlots: Array.isArray(body.deliverySlots) ? body.deliverySlots : [
              'Morning (7:00 AM - 10:00 AM)',
              'Afternoon (1:00 PM - 4:00 PM)',
              'Evening (6:00 PM - 9:00 PM)',
              'Express (15-30 mins)'
            ],
            driverAssigned: body.driverAssigned || ''
          };

          const { data, error } = await supabase.from('delivery_zones').upsert(toSnakeRow(values), { onConflict: 'id' }).select();
          throwIfError(error);

          return res.status(201).json(toCamelRow(data[0]));
        }
      } else {
        if (req.method === 'PUT') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const patch = {};
          if (body.area !== undefined) patch.area = body.area;
          if (body.pincode !== undefined) patch.pincode = String(body.pincode);
          if (body.time !== undefined) patch.time = body.time;
          if (body.distance !== undefined) patch.distance = body.distance;
          if (body.active !== undefined) patch.active = Boolean(body.active);
          if (body.deliveryFee !== undefined) patch.deliveryFee = Number(body.deliveryFee) || 0;
          if (body.freeDeliveryThreshold !== undefined) patch.freeDeliveryThreshold = Number(body.freeDeliveryThreshold) || 0;
          if (body.minOrderValue !== undefined) patch.minOrderValue = Number(body.minOrderValue) || 0;
          if (body.deliverySlots !== undefined) patch.deliverySlots = body.deliverySlots;
          if (body.driverAssigned !== undefined) patch.driverAssigned = body.driverAssigned;

          const { data, error } = await supabase.from('delivery_zones').update(toSnakeRow(patch)).eq('id', id).select();
          throwIfError(error);
          return res.status(200).json(toCamelRow(data[0]));
        }

        if (req.method === 'DELETE') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
          throwIfError(error);
          return res.status(200).json({ success: true, id });
        }
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── CMS Bulk Fetch: /api/settings?action=cms_all ─────────────────
    if (action === 'cms_all' && req.method === 'GET') {
      const [banners, pages, faqs, blogs, redirects, siteSettings] = await Promise.all([
        supabase.from('cms_banners').select('*').order('sort_order', { ascending: true }),
        supabase.from('cms_pages').select('*').order('updated_at', { ascending: false }),
        supabase.from('cms_faqs').select('*').order('sort_order', { ascending: true }),
        supabase.from('cms_blogs').select('*').order('created_at', { ascending: false }),
        supabase.from('seo_redirects').select('*').order('hits', { ascending: false }),
        supabase.from('settings').select('*').eq('id', 'default').maybeSingle(),
      ]);

      return res.status(200).json({
        banners: toCamelRows(banners.data),
        pages: toCamelRows(pages.data),
        faqs: toCamelRows(faqs.data),
        blogs: toCamelRows(blogs.data),
        redirects: toCamelRows(redirects.data),
        settings: siteSettings.data ? toCamelRow(siteSettings.data) : DEFAULTS,
      });
    }

    // ── Banners CRUD: /api/settings?action=banner ─────────────────────
    if (action === 'banner') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('cms_banners').select('*').order('sort_order', { ascending: true });
        throwIfError(error);
        return res.status(200).json(toCamelRows(data));
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const { data, error } = await supabase.from('cms_banners').insert({
          title: body.title,
          subtitle: body.subtitle || '',
          image: body.image,
          mobile_image: body.mobileImage || null,
          cta_text: body.ctaText || 'Shop Now',
          cta_link: body.ctaLink || '/categories',
          type: body.type || 'hero',
          sort_order: Number(body.sortOrder) || 0,
          active: body.active !== false,
        }).select();
        throwIfError(error);
        return res.status(201).json(toCamelRow(data[0]));
      }

      if (req.method === 'PUT' && id) {
        const { data, error } = await supabase.from('cms_banners').update({
          title: body.title,
          subtitle: body.subtitle,
          image: body.image,
          mobile_image: body.mobileImage,
          cta_text: body.ctaText,
          cta_link: body.ctaLink,
          type: body.type,
          sort_order: Number(body.sortOrder) || 0,
          active: body.active !== false,
        }).eq('id', Number(id)).select();
        throwIfError(error);
        return res.status(200).json(toCamelRow(data[0]));
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase.from('cms_banners').delete().eq('id', Number(id));
        throwIfError(error);
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Pages CRUD: /api/settings?action=page ─────────────────────────
    if (action === 'page') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('cms_pages').select('*').order('updated_at', { ascending: false });
        throwIfError(error);
        return res.status(200).json(toCamelRows(data));
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const { data, error } = await supabase.from('cms_pages').insert({
          slug: (body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/(^-|-$)/g, ''),
          title: body.title,
          content: body.content || '',
          category: body.category || 'general',
          meta_title: body.metaTitle || body.title,
          meta_description: body.metaDescription || '',
          is_published: body.isPublished !== false,
        }).select();
        throwIfError(error);
        return res.status(201).json(toCamelRow(data[0]));
      }

      if (req.method === 'PUT' && id) {
        const { data, error } = await supabase.from('cms_pages').update({
          slug: body.slug,
          title: body.title,
          content: body.content,
          category: body.category,
          meta_title: body.metaTitle,
          meta_description: body.metaDescription,
          is_published: body.isPublished !== false,
          updated_at: new Date().toISOString(),
        }).eq('id', Number(id)).select();
        throwIfError(error);
        return res.status(200).json(toCamelRow(data[0]));
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase.from('cms_pages').delete().eq('id', Number(id));
        throwIfError(error);
        return res.status(200).json({ success: true, id });
      }
    }

    // ── FAQs CRUD: /api/settings?action=faq ───────────────────────────
    if (action === 'faq') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('cms_faqs').select('*').order('sort_order', { ascending: true });
        throwIfError(error);
        return res.status(200).json(toCamelRows(data));
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const { data, error } = await supabase.from('cms_faqs').insert({
          question: body.question,
          answer: body.answer,
          category: body.category || 'General',
          sort_order: Number(body.sortOrder) || 0,
          active: body.active !== false,
        }).select();
        throwIfError(error);
        return res.status(201).json(toCamelRow(data[0]));
      }

      if (req.method === 'PUT' && id) {
        const { data, error } = await supabase.from('cms_faqs').update({
          question: body.question,
          answer: body.answer,
          category: body.category,
          sort_order: Number(body.sortOrder) || 0,
          active: body.active !== false,
        }).eq('id', Number(id)).select();
        throwIfError(error);
        return res.status(200).json(toCamelRow(data[0]));
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase.from('cms_faqs').delete().eq('id', Number(id));
        throwIfError(error);
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Blog CRUD: /api/settings?action=blog ──────────────────────────
    if (action === 'blog') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('cms_blogs').select('*').order('created_at', { ascending: false });
        throwIfError(error);
        return res.status(200).json(toCamelRows(data));
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const { data, error } = await supabase.from('cms_blogs').insert({
          slug: (body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/(^-|-$)/g, ''),
          title: body.title,
          excerpt: body.excerpt || '',
          content: body.content || '',
          author: body.author || 'Siri Traders Team',
          category: body.category || 'Grocery Tips',
          cover_image: body.coverImage || '',
          tags: body.tags || '',
          is_published: body.isPublished !== false,
        }).select();
        throwIfError(error);
        return res.status(201).json(toCamelRow(data[0]));
      }

      if (req.method === 'PUT' && id) {
        const { data, error } = await supabase.from('cms_blogs').update({
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt,
          content: body.content,
          author: body.author,
          category: body.category,
          cover_image: body.coverImage,
          tags: body.tags,
          is_published: body.isPublished !== false,
        }).eq('id', Number(id)).select();
        throwIfError(error);
        return res.status(200).json(toCamelRow(data[0]));
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase.from('cms_blogs').delete().eq('id', Number(id));
        throwIfError(error);
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Redirects CRUD: /api/settings?action=redirect ─────────────────
    if (action === 'redirect') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('seo_redirects').select('*').order('hits', { ascending: false });
        throwIfError(error);
        return res.status(200).json(toCamelRows(data));
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const { data, error } = await supabase.from('seo_redirects').insert({
          source_path: body.sourcePath,
          target_path: body.targetPath,
          status_code: Number(body.statusCode) || 301,
          hits: Number(body.hits) || 0,
          active: body.active !== false,
        }).select();
        throwIfError(error);
        return res.status(201).json(toCamelRow(data[0]));
      }

      if (req.method === 'PUT' && id) {
        const { data, error } = await supabase.from('seo_redirects').update({
          source_path: body.sourcePath,
          target_path: body.targetPath,
          status_code: Number(body.statusCode) || 301,
          hits: Number(body.hits) || 0,
          active: body.active !== false,
        }).eq('id', Number(id)).select();
        throwIfError(error);
        return res.status(200).json(toCamelRow(data[0]));
      }

      if (req.method === 'DELETE' && id) {
        const { error } = await supabase.from('seo_redirects').delete().eq('id', Number(id));
        throwIfError(error);
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Global Settings & SEO: /api/settings ──────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 'default').maybeSingle();
      throwIfError(error);
      return res.status(200).json(data ? toCamelRow(data) : DEFAULTS);
    }

    if (req.method === 'PUT') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const { data: existingRow, error: existingErr } = await supabase.from('settings').select('*').eq('id', 'default').maybeSingle();
      throwIfError(existingErr);
      const existing = existingRow ? toCamelRow(existingRow) : DEFAULTS;

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const values = {
        id: 'default',
        deliveryFee: body.deliveryFee !== undefined && Number.isFinite(Number(body.deliveryFee)) ? Number(body.deliveryFee) : existing.deliveryFee,
        freeDeliveryThreshold: body.freeDeliveryThreshold !== undefined && Number.isFinite(Number(body.freeDeliveryThreshold)) ? Number(body.freeDeliveryThreshold) : existing.freeDeliveryThreshold,
        minOrderValue: body.minOrderValue !== undefined && Number.isFinite(Number(body.minOrderValue)) ? Math.max(0, Number(body.minOrderValue)) : (existing.minOrderValue ?? 0),
        announcementText: body.announcementText !== undefined ? body.announcementText : existing.announcementText,
        announcementBg: body.announcementBg !== undefined ? body.announcementBg : existing.announcementBg,
        announcementColor: body.announcementColor !== undefined ? body.announcementColor : existing.announcementColor,
        announcementLink: body.announcementLink !== undefined ? body.announcementLink : existing.announcementLink,
        announcementActive: body.announcementActive !== undefined ? Boolean(body.announcementActive) : existing.announcementActive,
        metaTitle: body.metaTitle !== undefined ? body.metaTitle : existing.metaTitle,
        metaDescription: body.metaDescription !== undefined ? body.metaDescription : existing.metaDescription,
        canonicalUrl: body.canonicalUrl !== undefined ? body.canonicalUrl : existing.canonicalUrl,
        ogImage: body.ogImage !== undefined ? body.ogImage : existing.ogImage,
        robotsIndex: body.robotsIndex !== undefined ? Boolean(body.robotsIndex) : existing.robotsIndex,
        googleSiteVerification: body.googleSiteVerification !== undefined ? body.googleSiteVerification : existing.googleSiteVerification,
        schemaJson: body.schemaJson !== undefined ? body.schemaJson : existing.schemaJson,
        sitemapEnabled: body.sitemapEnabled !== undefined ? Boolean(body.sitemapEnabled) : existing.sitemapEnabled,
        headerMenu: body.headerMenu !== undefined ? body.headerMenu : existing.headerMenu,
        footerMenu: body.footerMenu !== undefined ? body.footerMenu : existing.footerMenu,
        homeSections: body.homeSections !== undefined ? body.homeSections : existing.homeSections
      };

      const { data, error } = await supabase.from('settings').upsert(toSnakeRow(values), { onConflict: 'id' }).select();
      throwIfError(error);
      return res.status(200).json(toCamelRow(data[0]));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/settings:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
