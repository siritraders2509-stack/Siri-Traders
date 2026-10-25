import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { categories as staticCategories } from '../data/categories';
import { fallbackDailyOffers, fallbackFestivalOffers } from '../data/offers';
import { retailCoupons as fallbackRetailCoupons, wholesaleCoupons as fallbackWholesaleCoupons } from '../data/coupons';
import { subscribeSync, SYNC_EVENTS } from '../utils/syncChannel';

const SiteDataContext = createContext();

export const useSiteData = () => {
  const context = useContext(SiteDataContext);
  if (!context) {
    throw new Error('useSiteData must be used within a SiteDataProvider');
  }
  return context;
};

const normalizeOffer = (o) => ({ ...o, group: o.groupType || o.group || 'daily' });

// All known fallback coupons keyed by code for fast lookup
const allFallbackCoupons = [
  ...fallbackRetailCoupons.map(c => ({ ...c, customerType: 'retail' })),
  ...fallbackWholesaleCoupons.map(c => ({ ...c, customerType: 'wholesale' })),
];
const fallbackByCode = new Map(allFallbackCoupons.map(c => [c.code, c]));

/**
 * Merge a DB coupon row with its static fallback so that rows seeded without
 * title/description still display correctly on the home screen.
 */
const normalizeCoupon = (dbCoupon) => {
  const fb = fallbackByCode.get(dbCoupon.code) || {};
  return {
    ...fb,          // start with fallback (has title, description, iconKey, type)
    ...dbCoupon,    // override with real DB values (active, value, minOrder, etc.)
    // if DB row has no title/description, keep fallback values
    title: dbCoupon.title || fb.title || dbCoupon.code,
    description: dbCoupon.description || fb.description || '',
    type: dbCoupon.type || fb.type || 'flat',
  };
};

const CACHE_KEY = 'siri_sitedata_cache_v2';
const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; }
};

export const SiteDataProvider = ({ children }) => {
  // Paint instantly from the last good copy; the network fetch refreshes it.
  const [cached] = useState(readCache);
  const [categories, setCategories] = useState(() => (Array.isArray(cached?.cat) ? cached.cat : []));
  const [offers, setOffers] = useState(() => (Array.isArray(cached?.offer) ? cached.offer.map(normalizeOffer) : []));
  const [coupons, setCoupons] = useState(() => (Array.isArray(cached?.coupon) ? cached.coupon.map(normalizeCoupon) : []));
  const [deliveryZones, setDeliveryZones] = useState(cached?.zone || []);
  const [deliverySettings, setDeliverySettings] = useState({ deliveryFee: 25, freeDeliveryThreshold: 500 });
  const [homeSections, setHomeSections] = useState(cached?.home || {
    todaysDeals: true,
    bestsellers: true,
    dailyOffers: true,
    festiveOffers: true,
    shopByCategory: true,
    categories: {}
  });
  const [cmsPages, setCmsPages] = useState(cached?.page || []);
  const [loading, setLoading] = useState(!cached);

  // ok:false means the request itself failed (network/5xx) — keep whatever's
  // on screen (static fallback or last good fetch). ok:true with an empty
  // array is a legitimate "nothing here" and must replace the fallback.
  //
  // Retries a couple of times with backoff first — a single transient 500
  // or cold-start blip used to immediately fall back to an empty/stale
  // cached list (most visible as categories "disappearing" on a fresh
  // device/browser with no prior cache to paint from).
  const fetchJson = async (url, retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch(url);
        if (r.ok) return { ok: true, data: await r.json() };
      } catch { /* network error — fall through to retry/backoff below */ }
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
    return { ok: false, data: null };
  };

  const fetchSiteData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [catRes, offerRes, couponRes, zoneRes, settingsRes, pageRes] = await Promise.all([
        fetchJson('/api/categories'),
        fetchJson('/api/offers'),
        fetchJson('/api/coupons'),
        fetchJson('/api/delivery_zones'),
        fetchJson('/api/settings'),
        fetchJson('/api/settings?action=page'),
      ]);

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          cat: catRes.ok ? catRes.data : cached?.cat, offer: offerRes.ok ? offerRes.data : cached?.offer,
          coupon: couponRes.ok ? couponRes.data : cached?.coupon, zone: zoneRes.ok ? zoneRes.data : cached?.zone,
          page: pageRes.ok ? pageRes.data : cached?.page,
          home: settingsRes.ok && settingsRes.data?.homeSections ? settingsRes.data.homeSections : cached?.home,
        }));
      } catch { /* quota/private mode */ }

      if (catRes.ok && Array.isArray(catRes.data)) setCategories(catRes.data);
      if (offerRes.ok && Array.isArray(offerRes.data)) setOffers(offerRes.data.map(normalizeOffer));
      if (couponRes.ok && Array.isArray(couponRes.data)) setCoupons(couponRes.data.map(normalizeCoupon));
      if (zoneRes.ok) setDeliveryZones(zoneRes.data);
      if (pageRes.ok) setCmsPages(pageRes.data);
      if (settingsRes.ok && settingsRes.data) {
        setDeliverySettings({
          deliveryFee: settingsRes.data.deliveryFee ?? 25,
          freeDeliveryThreshold: settingsRes.data.freeDeliveryThreshold ?? 500,
          minOrderValue: settingsRes.data.minOrderValue ?? 0,
        });
        if (settingsRes.data.homeSections) {
          setHomeSections(settingsRes.data.homeSections);
        }
      }
    } catch (err) {
      console.warn('Could not load live site data from database. Falling back to static defaults.', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [cached]);

  // Initial load
  useEffect(() => {
    fetchSiteData(!cached);
  }, [fetchSiteData, cached]);

  // Real-time synchronization: listen for admin changes across all tabs
  useEffect(() => {
    const unsubscribe = subscribeSync(
      [SYNC_EVENTS.SITE_DATA_CHANGED, SYNC_EVENTS.REFRESH_ALL],
      () => {
        fetchSiteData(false);
      }
    );

    const interval = setInterval(() => {
      fetchSiteData(false);
    }, 5 * 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [fetchSiteData]);

  const isCouponValid = (c) => {
    if (!c || c.active === false) return false;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (c.startDate) {
      const startDateStr = String(c.startDate).slice(0, 10);
      if (todayStr < startDateStr) return false;
    }
    if (c.endDate) {
      const endDateStr = String(c.endDate).slice(0, 10);
      if (todayStr > endDateStr) return false;
      if (String(c.endDate).includes('T')) {
        const endDateTime = new Date(c.endDate);
        if (!isNaN(endDateTime.getTime()) && now > endDateTime) return false;
      }
    }
    if (c.usageLimit && Number(c.timesUsed || 0) >= Number(c.usageLimit)) return false;
    return true;
  };

  const dailyOffers = offers.filter(o => o.active !== false && o.group === 'daily');
  const festivalOffers = offers.filter(o => o.active !== false && o.group === 'festival');
  const retailCoupons = coupons.filter(c => isCouponValid(c) && (c.customerType === 'retail' || c.customerType === 'all' || !c.customerType));
  const wholesaleCoupons = coupons.filter(c => isCouponValid(c) && (c.customerType === 'wholesale' || c.customerType === 'all' || !c.customerType));

  const getCmsPage = (slug) => cmsPages.find(p => p.slug === slug && p.isPublished !== false) || null;

  const value = {
    categories,
    dailyOffers,
    festivalOffers,
    retailCoupons,
    wholesaleCoupons,
    allCoupons: coupons,
    isCouponValid,
    deliveryZones,
    deliverySettings,
    homeSections,
    setHomeSections,
    cmsPages,
    getCmsPage,
    loading,
    refreshSiteData: () => fetchSiteData(false),
  };

  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>;
};

