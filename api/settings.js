import { db, settings, deliveryZones, cmsBanners, cmsPages, cmsFaqs, cmsBlogs, seoRedirects } from '../db/index.js';
import { eq, asc, desc, sql } from 'drizzle-orm';
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

  try {
    // ── Delivery Zones Sub-handler: /api/delivery_zones or ?resource=delivery_zones
    if (resource === 'delivery_zones' || action === 'delivery_zones') {
      if (!id) {
        if (req.method === 'GET') {
          const allZones = await db.select().from(deliveryZones);
          return res.status(200).json(allZones);
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
            id: zoneId,
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

          const saved = await db.insert(deliveryZones).values(values).onConflictDoUpdate({
            target: deliveryZones.id,
            set: values
          }).returning();

          return res.status(201).json(saved[0]);
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

          const updated = await db.update(deliveryZones).set(patch).where(eq(deliveryZones.id, id)).returning();
          return res.status(200).json(updated[0]);
        }

        if (req.method === 'DELETE') {
          const adminOk = await isAdminRequest(req);
          if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

          await db.delete(deliveryZones).where(eq(deliveryZones.id, id));
          return res.status(200).json({ success: true, id });
        }
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── CMS Bulk Fetch: /api/settings?action=cms_all ─────────────────
    if (action === 'cms_all' && req.method === 'GET') {
      const [banners, pages, faqs, blogs, redirects, siteSettings] = await Promise.all([
        db.select().from(cmsBanners).orderBy(asc(cmsBanners.sortOrder)),
        db.select().from(cmsPages).orderBy(desc(cmsPages.updatedAt)),
        db.select().from(cmsFaqs).orderBy(asc(cmsFaqs.sortOrder)),
        db.select().from(cmsBlogs).orderBy(desc(cmsBlogs.createdAt)),
        db.select().from(seoRedirects).orderBy(desc(seoRedirects.hits)),
        db.select().from(settings).where(eq(settings.id, 'default'))
      ]);

      return res.status(200).json({
        banners,
        pages,
        faqs,
        blogs,
        redirects,
        settings: siteSettings[0] || DEFAULTS
      });
    }

    // ── Banners CRUD: /api/settings?action=banner ─────────────────────
    if (action === 'banner') {
      if (req.method === 'GET') {
        const rows = await db.select().from(cmsBanners).orderBy(asc(cmsBanners.sortOrder));
        return res.status(200).json(rows);
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const saved = await db.insert(cmsBanners).values({
          title: body.title,
          subtitle: body.subtitle || '',
          image: body.image,
          mobileImage: body.mobileImage || null,
          ctaText: body.ctaText || 'Shop Now',
          ctaLink: body.ctaLink || '/categories',
          type: body.type || 'hero',
          sortOrder: Number(body.sortOrder) || 0,
          active: body.active !== false
        }).returning();
        return res.status(201).json(saved[0]);
      }

      if (req.method === 'PUT' && id) {
        const updated = await db.update(cmsBanners).set({
          title: body.title,
          subtitle: body.subtitle,
          image: body.image,
          mobileImage: body.mobileImage,
          ctaText: body.ctaText,
          ctaLink: body.ctaLink,
          type: body.type,
          sortOrder: Number(body.sortOrder) || 0,
          active: body.active !== false
        }).where(eq(cmsBanners.id, Number(id))).returning();
        return res.status(200).json(updated[0]);
      }

      if (req.method === 'DELETE' && id) {
        await db.delete(cmsBanners).where(eq(cmsBanners.id, Number(id)));
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Pages CRUD: /api/settings?action=page ─────────────────────────
    if (action === 'page') {
      if (req.method === 'GET') {
        const rows = await db.select().from(cmsPages).orderBy(desc(cmsPages.updatedAt));
        return res.status(200).json(rows);
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const saved = await db.insert(cmsPages).values({
          slug: (body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/(^-|-$)/g, ''),
          title: body.title,
          content: body.content || '',
          category: body.category || 'general',
          metaTitle: body.metaTitle || body.title,
          metaDescription: body.metaDescription || '',
          isPublished: body.isPublished !== false
        }).returning();
        return res.status(201).json(saved[0]);
      }

      if (req.method === 'PUT' && id) {
        const updated = await db.update(cmsPages).set({
          slug: body.slug,
          title: body.title,
          content: body.content,
          category: body.category,
          metaTitle: body.metaTitle,
          metaDescription: body.metaDescription,
          isPublished: body.isPublished !== false,
          updatedAt: new Date()
        }).where(eq(cmsPages.id, Number(id))).returning();
        return res.status(200).json(updated[0]);
      }

      if (req.method === 'DELETE' && id) {
        await db.delete(cmsPages).where(eq(cmsPages.id, Number(id)));
        return res.status(200).json({ success: true, id });
      }
    }

    // ── FAQs CRUD: /api/settings?action=faq ───────────────────────────
    if (action === 'faq') {
      if (req.method === 'GET') {
        const rows = await db.select().from(cmsFaqs).orderBy(asc(cmsFaqs.sortOrder));
        return res.status(200).json(rows);
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const saved = await db.insert(cmsFaqs).values({
          question: body.question,
          answer: body.answer,
          category: body.category || 'General',
          sortOrder: Number(body.sortOrder) || 0,
          active: body.active !== false
        }).returning();
        return res.status(201).json(saved[0]);
      }

      if (req.method === 'PUT' && id) {
        const updated = await db.update(cmsFaqs).set({
          question: body.question,
          answer: body.answer,
          category: body.category,
          sortOrder: Number(body.sortOrder) || 0,
          active: body.active !== false
        }).where(eq(cmsFaqs.id, Number(id))).returning();
        return res.status(200).json(updated[0]);
      }

      if (req.method === 'DELETE' && id) {
        await db.delete(cmsFaqs).where(eq(cmsFaqs.id, Number(id)));
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Blog CRUD: /api/settings?action=blog ──────────────────────────
    if (action === 'blog') {
      if (req.method === 'GET') {
        const rows = await db.select().from(cmsBlogs).orderBy(desc(cmsBlogs.createdAt));
        return res.status(200).json(rows);
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const saved = await db.insert(cmsBlogs).values({
          slug: (body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/(^-|-$)/g, ''),
          title: body.title,
          excerpt: body.excerpt || '',
          content: body.content || '',
          author: body.author || 'Siri Traders Team',
          category: body.category || 'Grocery Tips',
          coverImage: body.coverImage || '',
          tags: body.tags || '',
          isPublished: body.isPublished !== false
        }).returning();
        return res.status(201).json(saved[0]);
      }

      if (req.method === 'PUT' && id) {
        const updated = await db.update(cmsBlogs).set({
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt,
          content: body.content,
          author: body.author,
          category: body.category,
          coverImage: body.coverImage,
          tags: body.tags,
          isPublished: body.isPublished !== false
        }).where(eq(cmsBlogs.id, Number(id))).returning();
        return res.status(200).json(updated[0]);
      }

      if (req.method === 'DELETE' && id) {
        await db.delete(cmsBlogs).where(eq(cmsBlogs.id, Number(id)));
        return res.status(200).json({ success: true, id });
      }
    }

    // ── Redirects CRUD: /api/settings?action=redirect ─────────────────
    if (action === 'redirect') {
      if (req.method === 'GET') {
        const rows = await db.select().from(seoRedirects).orderBy(desc(seoRedirects.hits));
        return res.status(200).json(rows);
      }

      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (req.method === 'POST') {
        const saved = await db.insert(seoRedirects).values({
          sourcePath: body.sourcePath,
          targetPath: body.targetPath,
          statusCode: Number(body.statusCode) || 301,
          hits: Number(body.hits) || 0,
          active: body.active !== false
        }).returning();
        return res.status(201).json(saved[0]);
      }

      if (req.method === 'PUT' && id) {
        const updated = await db.update(seoRedirects).set({
          sourcePath: body.sourcePath,
          targetPath: body.targetPath,
          statusCode: Number(body.statusCode) || 301,
          hits: Number(body.hits) || 0,
          active: body.active !== false
        }).where(eq(seoRedirects.id, Number(id))).returning();
        return res.status(200).json(updated[0]);
      }

      if (req.method === 'DELETE' && id) {
        await db.delete(seoRedirects).where(eq(seoRedirects.id, Number(id)));
        return res.status(200).json({ success: true, id });
      }
    }

    // The one-time schema migration that used to run here (adding columns
    // to `settings`) has long since applied in production — this endpoint
    // is hit on effectively every page load (site-wide config, announcement
    // banner) plus every admin settings save, so re-checking it via ALTER
    // TABLE on every cold Workers isolate was a major contributor to
    // exhausting the daily Hyperdrive quota. Removed.

    // ── Global Settings & SEO: /api/settings ──────────────────────────
    if (req.method === 'GET') {
      const rows = await db.select().from(settings).where(eq(settings.id, 'default'));
      return res.status(200).json(rows[0] || DEFAULTS);
    }

    if (req.method === 'PUT') {
      const adminOk = await isAdminRequest(req);
      if (!adminOk) return res.status(403).json({ error: 'Forbidden: admin access required' });

      const existingRows = await db.select().from(settings).where(eq(settings.id, 'default'));
      const existing = existingRows[0] || DEFAULTS;

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

      try {
        const saved = await db.insert(settings).values(values).onConflictDoUpdate({
          target: settings.id,
          set: values
        }).returning();
        return res.status(200).json(saved[0]);
      } catch (saveErr) {
        console.warn('First save attempt in /api/settings failed, ensuring column exists:', saveErr?.message || saveErr);
        const saved = await db.insert(settings).values(values).onConflictDoUpdate({
          target: settings.id,
          set: values
        }).returning();
        return res.status(200).json(saved[0]);
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/settings:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
