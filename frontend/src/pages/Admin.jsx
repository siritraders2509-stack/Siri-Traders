import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FiBarChart2,
  FiEdit2,
  FiDollarSign,
  FiGift,
  FiLock,
  FiLogOut,
  FiPackage,
  FiPlus,
  FiSave,
  FiSearch,
  FiTag,
  FiShoppingBag,
  FiTrash2,
  FiTruck,
  FiUsers,
  FiX,
  FiMapPin,
  FiSettings,
  FiStar,
  FiCheck,
  FiTrendingUp,
  FiMail,
  FiLayers,
  FiAlertTriangle,
  FiAlertCircle,
  FiClock,
  FiRefreshCw,
  FiActivity,
  FiArchive,
  FiSliders,
  FiInfo,
  FiCheckCircle,
  FiCopy,
  FiEye,
  FiEyeOff,
  FiPercent,
  FiGrid,
  FiPrinter,
  FiFileText,
  FiRotateCcw,
  FiCreditCard,
  FiNavigation,
  FiPhone,
  FiMessageCircle,
  FiCalendar,
  FiXCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiPieChart,
  FiVolume2,
  FiImage,
  FiHelpCircle,
  FiBookOpen,
  FiShield
} from 'react-icons/fi';
import { useAdminApi } from '../hooks/useAdminApi';
import { useSiteData } from '../context/SiteDataContext';
import { formatPrice, getOrderBillBreakdown } from '../utils/format';
import { toWebpImage } from '../utils/images';
import ProductImage from '../components/ProductImage';
import { broadcastSync, subscribeSync, SYNC_EVENTS } from '../utils/syncChannel';

import './Admin.css';

const formatWeightUnit = (weight, unit) => {
  if (!weight) return '';
  const wStr = String(weight).trim();
  const uStr = String(unit || '').trim();
  if (!uStr) return wStr;
  const wLower = wStr.toLowerCase();
  const uLower = uStr.toLowerCase();
  if (wLower.endsWith(uLower)) return wStr;
  return `${wStr} ${uStr}`;
};

const ADMIN_PRODUCTS_RETAIL_KEY = 'siri-admin-products-retail';
const ADMIN_PRODUCTS_WHOLESALE_KEY = 'siri-admin-products-wholesale';

const readStorage = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const genSku = (category = 'GEN') => `SIRI-${(category || 'GEN').substring(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
const genBarcode = () => `890${Math.floor(100000000 + Math.random() * 900000000)}`;

const blankProduct = {
  id: '',
  name: '',
  category: '',
  subcategory: '',
  brand: '',
  sku: '',
  barcode: '',
  weight: '',
  unit: 'g',
  packSize: '',
  price: '',
  mrp: '',
  costPrice: '',
  discount: '',
  hsnCode: '',
  batchNumber: '',
  mfgDate: '',
  expiryDate: '',
  image: '',
  description: '',
  inStock: false,
  stockNote: 'Out of stock',
  isPublished: true,
  isArchived: false,
  deliveryTime: '15 mins',
  isBestseller: false,
  isTodaysDeal: false,
  targetType: 'retail_and_wholesale',
  wholesalePrice: '',
  bulkPackLabel: '',
  bulkPackPrice: '',
  wholesaleCaseLabel: '',
  wholesaleCasePrice: '',
  variants: []
};

const blankWholesaleProduct = {
  id: '',
  name: '',
  category: '',
  subcategory: '',
  brand: '',
  sku: '',
  barcode: '',
  weight: '',
  unit: 'kg',
  packSize: '',
  price: '',
  mrp: '',
  costPrice: '',
  discount: '',
  hsnCode: '',
  batchNumber: '',
  mfgDate: '',
  expiryDate: '',
  image: '',
  description: '',
  inStock: true,
  stockNote: 'In stock',
  isPublished: true,
  isArchived: false,
  deliveryTime: 'Same day',
  isBestseller: false,
  isTodaysDeal: false,
  wholesalePrice: '',
  bulkPackLabel: '',
  bulkPackPrice: '',
  wholesaleCaseLabel: '',
  wholesaleCasePrice: '',
  variants: []
};

const blankOffer = {
  id: '',
  title: '',
  subtitle: '',
  badge: '',
  price: '',
  mrp: '',
  discountAmount: '',
  image: '',
  group: 'daily',
  type: 'Sale offer',
  buyQty: 1,
  getQty: 1,
  targetCategory: '',
  targetProductId: '',
  itemsIncluded: '',
  startDate: '',
  endDate: '',
  usageLimit: '',
  link: '/categories',
  active: true
};


const blankCoupon = {
  id: '',
  code: '',
  type: 'flat', // 'flat' | 'percent' | 'bogo' | 'buyXgetY' | 'freeDelivery'
  value: '',
  minOrder: '',
  maxDiscount: '',
  buyQuantity: 1,
  getQuantity: 1,
  targetType: 'all', // 'all' | 'category' | 'product' | 'customer'
  targetCategory: '',
  targetProductId: '',
  targetCustomerEmail: '',
  usageLimit: 500,
  perUserLimit: 1,
  startDate: '',
  endDate: '',
  title: '',
  description: '',
  customerType: 'retail',
  active: true
};

const blankAdmin = {
  name: '',
  email: '',
  password: '',
  role: 'Viewer'
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (filename, rows) => {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const ADMIN_ROLE_PERMISSIONS = {
  Owner: ['dashboard','inventory','sales-stats','orders','customers','reviews','cms','home-sections','products','retail-products','wholesale-products','offers','festive-offers','bestsellers','delivery-zones','min-order-value','broadcast','admins'],
  'Super Admin': ['dashboard','inventory','sales-stats','orders','customers','reviews','cms','home-sections','products','retail-products','wholesale-products','offers','festive-offers','bestsellers','delivery-zones','min-order-value','broadcast'],
  'Product Manager': ['dashboard','inventory','products','retail-products','wholesale-products','festive-offers','reviews','bestsellers','home-sections','min-order-value'],
  'Order Manager': ['dashboard','inventory','orders','customers','delivery-zones','min-order-value'],
  'Marketing Manager': ['dashboard','offers','festive-offers','cms','bestsellers','broadcast','reviews','home-sections','min-order-value'],
  'Content Manager': ['dashboard','cms','reviews','home-sections'],
  'Customer Support': ['dashboard','inventory','customers','orders','reviews','delivery-zones','min-order-value'],
  Viewer: ['dashboard','inventory','sales-stats']
};

const ADMIN_NAV_SECTIONS = [
  {
    title: 'SALES & ORDERS',
    items: [
      ['dashboard', 'Overview', FiBarChart2],
      ['sales-stats', 'Sales Analytics', FiTrendingUp],
      ['orders', 'Orders & Payments', FiShoppingBag],
      ['customers', 'Customer Hub', FiUsers]
    ]
  },
  {
    title: 'INVENTORY & DELIVERY',
    items: [
      ['inventory', 'Inventory Hub', FiLayers],
      ['delivery-zones', 'Delivery Zones', FiTruck],
      ['min-order-value', 'Minimum Order Value', FiDollarSign],
      ['broadcast', 'Email Broadcast', FiMail]
    ]
  },
  {
    title: 'WEBSITE CONTENT',
    items: [
      ['home-sections', 'Home Page Layout', FiGrid],
      ['cms', 'Terms & Policy', FiEdit2]
    ]
  },
  {
    title: 'PROMOTIONS & REVIEWS',
    items: [
      ['offers', 'Promos & Coupons', FiGift],
      ['reviews', 'Customer Reviews', FiStar]
    ]
  },
  {
    title: 'PRODUCT CATALOG',
    items: [
      ['products', 'Product Catalog', FiPackage],
      ['festive-offers', 'Festive Offers', FiGift],
      ['bestsellers', 'Bestsellers & Deals', FiStar]
    ]
  },
  {
    title: 'ADMINISTRATION',
    items: [
      ['admins', 'Admin Members', FiLock]
    ]
  }
];

const Admin = () => {
  const [selectedAdminRole, setSelectedAdminRole] = useState('Viewer');
  const navigate = useNavigate();
  const [adminSession, setAdminSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminMode, setAdminMode] = useState('retail');
  const [searchQuery, setSearchQuery] = useState('');

  const [dbProductsList, setDbProductsList] = useState([]);

  // Status, Category & Target Availability filters for products
  const [productStatusFilter, setProductStatusFilter] = useState('published');

  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productTargetFilter, setProductTargetFilter] = useState('all');
  const [expandedVariantId, setExpandedVariantId] = useState(null);
  const [detailedVariants, setDetailedVariants] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  // Decoupled from activeTab so the modal can be opened from Inventory Hub
  // (which stays on its own tab) and still know whether to save/show as
  // retail or wholesale.
  const [productModalMode, setProductModalMode] = useState('retail');
  const [additionalItems, setAdditionalItems] = useState([]);

  const addAnotherItem = () => {
    setAdditionalItems(prev => [
      ...prev,
      {
        ...blankProduct,
        category: productDraft.category,
        brand: productDraft.brand,
        targetType: productDraft.targetType || 'retail_and_wholesale',
        description: productDraft.description,
        unit: productDraft.unit || 'g',
        isPublished: productDraft.isPublished !== false
      }
    ]);
  };

  const removeAdditionalItem = (index) => {
    setAdditionalItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateAdditionalItem = (index, field, value) => {
    setAdditionalItems(prev => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  };

  const handleAdditionalImageUpload = async (index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    updateAdditionalItem(index, 'image', previewUrl);
    setImageUploading(true);
    try {
      const compressed = await compressImageFile(file);
      const url = await adminApi.uploadImage(compressed);
      updateAdditionalItem(index, 'image', url);
      URL.revokeObjectURL(previewUrl);
    } catch (err) {
      alert(err.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const addAdditionalVariantRow = (itemIdx, label = '', price = '') => {
    setAdditionalItems(prev => prev.map((item, idx) => {
      if (idx !== itemIdx) return item;
      const currentVars = item.variants || [];
      return {
        ...item,
        variants: [
          ...currentVars,
          { id: `var-${Date.now()}-${Math.random()}`, label, price, unit: item.unit || productDraft.unit || 'g' }
        ]
      };
    }));
  };

  const updateAdditionalVariantRow = (itemIdx, varIdx, field, value) => {
    setAdditionalItems(prev => prev.map((item, idx) => {
      if (idx !== itemIdx) return item;
      const updatedVars = (item.variants || []).map((v, i) => i === varIdx ? { ...v, [field]: value } : v);
      return { ...item, variants: updatedVars };
    }));
  };

  const removeAdditionalVariantRow = (itemIdx, varIdx) => {
    setAdditionalItems(prev => prev.map((item, idx) => {
      if (idx !== itemIdx) return item;
      const updatedVars = (item.variants || []).filter((_, i) => i !== varIdx);
      return { ...item, variants: updatedVars };
    }));
  };

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState({ name: '', image: '', color: '#F1F8E9' });
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const [offers, setOffers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [productDraft, setProductDraft] = useState(blankProduct);
  const [publishPromptProduct, setPublishPromptProduct] = useState(null); // newly saved product awaiting publish decision

  const [apiLoading, setApiLoading] = useState(false);
  const [saveToast, setSaveToast] = useState(null);
  const [liveOrders, setLiveOrders] = useState(null);
  const [liveCustomers, setLiveCustomers] = useState(null);
  const adminApi = useAdminApi();
  const { homeSections, setHomeSections, categories: siteCategories, refreshSiteData, deliverySettings } = useSiteData();
  const [localHomeSections, setLocalHomeSections] = useState({
    todaysDeals: true,
    bestsellers: true,
    dailyOffers: true,
    festiveOffers: true,
    shopByCategory: true,
    categories: {}
  });
  const [minOrderValueInput, setMinOrderValueInput] = useState(() => deliverySettings?.minOrderValue ?? 0);

  useEffect(() => {
    if (homeSections) {
      setLocalHomeSections(homeSections);
    }
  }, [homeSections]);

  useEffect(() => {
    if (deliverySettings?.minOrderValue !== undefined) {
      setMinOrderValueInput(deliverySettings.minOrderValue);
    }
  }, [deliverySettings?.minOrderValue]);

  const saveMinOrderSettings = async () => {
    setApiLoading(true);
    try {
      const val = Math.max(0, parseInt(minOrderValueInput, 10) || 0);
      await adminApi.updateSettings({ minOrderValue: val });
      if (typeof refreshSiteData === 'function') refreshSiteData();
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
      setSaveToast({ type: 'success', msg: `Minimum order value set to ${formatPrice(val)} successfully!` });
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      alert('Failed to save minimum order value: ' + err.message);
    } finally {
      setApiLoading(false);
    }
  };

  const saveHomeSectionSettings = async () => {
    setApiLoading(true);
    try {
      const updated = await adminApi.updateSettings({ homeSections: localHomeSections });
      if (updated && updated.homeSections) {
        setHomeSections(updated.homeSections);
      }
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
      setSaveToast({ type: 'success', msg: 'Home page layout settings updated successfully!' });
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setApiLoading(false);
    }
  };

  // Store open/closed is saved immediately (not via "Save Settings") and merged
  // into the last *saved* homeSections so unsaved layout edits aren't published.
  const setStoreOpen = async (open) => {
    setApiLoading(true);
    try {
      const updated = await adminApi.updateSettings({ homeSections: { ...(homeSections || {}), storeOpen: open } });
      if (updated && updated.homeSections) setHomeSections(updated.homeSections);
      setLocalHomeSections(prev => ({ ...prev, storeOpen: open }));
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
      setSaveToast({ type: 'success', msg: open ? 'Store is now OPEN.' : 'Store is now CLOSED. The homepage banner shows it.' });
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      alert('Failed to update store status: ' + err.message);
    } finally {
      setApiLoading(false);
    }
  };

  // ── Featured section editor (edit built-ins, add/edit/remove custom sections) ──
  // Everything lives in homeSections: sectionMeta[key] = { title, icon, removed }
  // for built-in sections and customSections = [{ id, title, icon, productIds }].
  const [sectionEditor, setSectionEditor] = useState(null);
  const [sectionProductSearch, setSectionProductSearch] = useState('');

  const openBuiltinEditor = (item) => setSectionEditor({ mode: 'builtin', key: item.key, title: item.title, icon: item.icon, productIds: [] });
  const openCustomEditor = (sec) => setSectionEditor(sec
    ? { mode: 'custom', id: sec.id, title: sec.title, icon: sec.icon || '✨', productIds: sec.productIds || [] }
    : { mode: 'custom', id: null, title: '', icon: '✨', productIds: [] });

  const saveSectionEditor = () => {
    if (!sectionEditor) return;
    const title = sectionEditor.title.trim();
    if (!title) { alert('Please enter a section title.'); return; }
    const icon = sectionEditor.icon.trim() || '✨';
    setLocalHomeSections(prev => {
      if (sectionEditor.mode === 'builtin') {
        return { ...prev, sectionMeta: { ...(prev.sectionMeta || {}), [sectionEditor.key]: { ...(prev.sectionMeta?.[sectionEditor.key] || {}), title, icon } } };
      }
      const list = prev.customSections || [];
      const entry = { id: sectionEditor.id || `cs-${Date.now().toString(36)}`, title, icon, productIds: sectionEditor.productIds, enabled: true };
      const exists = list.some(x => x.id === entry.id);
      return { ...prev, customSections: exists ? list.map(x => (x.id === entry.id ? { ...x, ...entry, enabled: x.enabled !== false } : x)) : [...list, entry] };
    });
    setSectionEditor(null);
    setSectionProductSearch('');
  };

  const removeBuiltinSection = (item) => {
    if (!window.confirm(`Remove "${item.title}" from the homepage? You can restore it later.`)) return;
    setLocalHomeSections(prev => ({ ...prev, sectionMeta: { ...(prev.sectionMeta || {}), [item.key]: { ...(prev.sectionMeta?.[item.key] || {}), removed: true } } }));
  };
  const restoreBuiltinSection = (key) => setLocalHomeSections(prev => ({ ...prev, sectionMeta: { ...(prev.sectionMeta || {}), [key]: { ...(prev.sectionMeta?.[key] || {}), removed: false } } }));
  const removeCustomSection = (sec) => {
    if (!window.confirm(`Delete the "${sec.title}" section?`)) return;
    setLocalHomeSections(prev => ({ ...prev, customSections: (prev.customSections || []).filter(x => x.id !== sec.id) }));
  };
  const toggleCustomSection = (id, enabled) => setLocalHomeSections(prev => ({ ...prev, customSections: (prev.customSections || []).map(x => (x.id === id ? { ...x, enabled } : x)) }));

  const toggleSectionKey = (key, enabled) => {
    setLocalHomeSections(prev => ({
      ...prev,
      [key]: enabled
    }));
  };

  const toggleCategoryKey = (catId, enabled) => {
    setLocalHomeSections(prev => ({
      ...prev,
      categories: {
        ...(prev?.categories || {}),
        [catId]: enabled
      }
    }));
  };

  const [newOrderToast, setNewOrderToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState(null);
  const [broadcastChannel, setBroadcastChannel] = useState('email');
  const [selectedBroadcastEmails, setSelectedBroadcastEmails] = useState([]);
  const [broadcastSegment, setBroadcastSegment] = useState('all');

  // ── CMS State ──
  const [cmsData, setCmsData] = useState({
    pages: [],
    redirects: [],
    settings: {}
  });
  const [editingPage, setEditingPage] = useState(null);
  const [newPageDraft, setNewPageDraft] = useState(null);

  const loadCmsData = async () => {
    try {
      const data = await adminApi.fetchCmsAll();
      setCmsData(data);
    } catch (err) {
      console.error('Failed to load CMS content:', err);
    }
  };

  // ── Reviews & Ratings Management State ──
  const [reviewsList, setReviewsList] = useState([]);
  const [reviewFilter, setReviewFilter] = useState('all'); // 'all'|'5'|'4'|'3'|'low'|'pending'
  const [reviewSearchQuery, setReviewSearchQuery] = useState('');
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // ── Deep Analytics State ──
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState('30'); // '1'|'7'|'30'|'90'|'365'

  // ── Orders & Payments Management State ──
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedOrderModal, setSelectedOrderModal] = useState(null);
  const [invoiceModalOrder, setInvoiceModalOrder] = useState(null);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: 'Customer return / out of stock' });
  const [orderNotesText, setOrderNotesText] = useState('');
  const [orderActionLoading, setOrderActionLoading] = useState(false);

  // ── Grocery Delivery Management State ──
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [deliveryZoneSearch, setDeliveryZoneSearch] = useState('');
  const [newZone, setNewZone] = useState({
    area: '',
    pincode: '',
    time: '30 mins',
    distance: '',
    deliveryFee: 0,
    driverAssigned: ''
  });
  const [editingZoneModal, setEditingZoneModal] = useState(null);
  const [showZonesModal, setShowZonesModal] = useState(false);
  const [showAddZoneModal, setShowAddZoneModal] = useState(false);

  // ── Customer Management State ──
  const [customerSegmentFilter, setCustomerSegmentFilter] = useState('all');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerModal, setSelectedCustomerModal] = useState(null);

  // ── Inventory Management State ──
  const [inventoryData, setInventoryData] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('all');
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Modals for Stock Adjustment & History
  const [adjustModalItem, setAdjustModalItem] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    changeType: 'ADD',
    quantity: '',
    targetField: 'availableStock',
    reason: 'Purchase / New Stock Received',
    notes: ''
  });
  const [adjustLoading, setAdjustLoading] = useState(false);

  const [historyModalItem, setHistoryModalItem] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [offerDraft, setOfferDraft] = useState(blankOffer);
  const [customComboDraft, setCustomComboDraft] = useState({ name: '', price: '', mrp: '', image: '' });
  const [customComboImageUploading, setCustomComboImageUploading] = useState(false);
  const [couponDraft, setCouponDraft] = useState(blankCoupon);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminDraft, setAdminDraft] = useState(blankAdmin);
  const [adminError, setAdminError] = useState('');

  // ── Security tab: self-service password change ──
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [passwordChangeStatus, setPasswordChangeStatus] = useState(null);
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [promoTagSearch, setPromoTagSearch] = useState('');
  const [dbCategories, setDbCategories] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', image: '', color: '#F7F4EE' });

  const groceryUnitPresets = [
    '100 g', '250 g', '500 g', '1 kg', '2 kg', '5 kg', '10 kg', '25 kg',
    '100 ml', '200 ml', '500 ml', '1 L', '2 L', '5 L', '15 L',
    '1 pc', 'Pack of 2', 'Pack of 4', 'Pack of 6', 'Pack of 12', 'Box (10 pcs)'
  ];

  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.3);
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1109.73, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc2.start(audioCtx.currentTime);
        osc2.stop(audioCtx.currentTime + 0.4);
      }, 120);
    } catch (err) {
      console.warn("Failed to play notification audio:", err);
    }
  };

  const loadProductsFromDb = useCallback(async () => {
    try {
      const dbProducts = await adminApi.fetchProducts(true);
      const list = Array.isArray(dbProducts) ? dbProducts : [];
      const normalize = p => ({
        ...p,
        stockNote: p.inStock ? 'In stock' : 'Out of stock',
        isPublished: p.isPublished ?? true,
        isArchived: p.isArchived ?? false
      });
      setDbProductsList(list.map(normalize));
    } catch (err) {
      console.warn("Failed to fetch products from DB:", err);
    }
  }, [adminApi]);

  const loadCoupons = useCallback(async () => {
    try {
      const data = await adminApi.fetchCoupons();
      if (Array.isArray(data)) {
        setCoupons(data);
      }
    } catch (err) {
      console.warn('Failed to load coupons:', err);
    }
  }, [adminApi]);

  const normalizeOffer = (o) => ({ ...o, group: o.groupType || o.group || 'daily' });
  const allowedAdminTabs = ADMIN_ROLE_PERMISSIONS[selectedAdminRole] || ADMIN_ROLE_PERMISSIONS.Viewer;

  // ── Load Orders ──
  const loadOrders = async () => {
    try {
      const ords = await adminApi.fetchAllOrders();
      setLiveOrders(ords);
    } catch (err) {
      console.error('Failed to load orders:', err);
    }
  };

  // ── Load Customers ──
  const loadCustomers = async () => {
    try {
      const usersList = await adminApi.fetchAllUsers();
      setLiveCustomers(usersList);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  // ── Manual customer segment (VIP / Returning / New / Inactive) ──
  // Pass null to clear the override and fall back to the auto-computed segment.
  const setCustomerSegmentOverride = async (customer, nextSegment) => {
    try {
      const updated = await adminApi.setCustomerSegment(customer.id, nextSegment);
      setLiveCustomers(prev => (prev || []).map(c => c.id === customer.id ? { ...c, ...updated } : c));
    } catch (err) {
      alert(`Failed to update segment: ${err.message}`);
    }
  };

  // ── Broadcast recipient selection (individual customers or a whole segment) ──
  const toggleCustomerSelection = (email) => {
    if (!email) return;
    setSelectedBroadcastEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  const selectFilteredCustomers = () => {
    setSelectedBroadcastEmails(filteredCustomers.map(c => c.email).filter(Boolean));
  };

  const clearCustomerSelection = () => setSelectedBroadcastEmails([]);

  // ── Broadcast page's own quick segment picker (All / VIP / Returning / New / Inactive) ──
  const selectBroadcastSegment = (segment) => {
    setBroadcastSegment(segment);
    const pool = liveCustomers || [];
    const matched = segment === 'all' ? pool : pool.filter(c => c.segment === segment);
    setSelectedBroadcastEmails(matched.map(c => c.email).filter(Boolean));
  };

  // ── Load Reviews ──
  const loadReviews = async () => {
    setReviewsLoading(true);
    try {
      const revs = await adminApi.fetchReviews();
      setReviewsList(revs);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  // ── Load Inventory ──
  const loadInventory = async (showLoading = false) => {
    if (showLoading || !inventoryData) {
      setInventoryLoading(true);
    }
    try {
      const data = await adminApi.fetchInventory();
      setInventoryData(data);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setInventoryLoading(false);
    }
  };

  // ── Load Inventory Movement Logs ──
  const loadInventoryLogs = async (showLoading = false) => {
    if (showLoading || !inventoryLogs) {
      setLogsLoading(true);
    }
    try {
      const logs = await adminApi.fetchInventoryLogs();
      setInventoryLogs(logs);
    } catch (err) {
      console.error('Failed to load inventory logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // ── Load initial data ──
  useEffect(() => {
    loadProductsFromDb();
  }, [loadProductsFromDb]);
  
  useEffect(() => {
    adminApi.me().then(session => {
      setAdminSession(session);
      setSessionChecked(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (adminSession?.role) {
      const sessionRole = String(adminSession.role);
      // An unrecognized role (e.g. old/bad data) must fall back to the least-
      // privileged Viewer tab set, not silently keep whatever selectedAdminRole
      // happened to already be — leaving it unset here let an unrecognized
      // role keep the component's initial 'Owner' state, i.e. full access.
      setSelectedAdminRole(ADMIN_ROLE_PERMISSIONS[sessionRole] ? sessionRole : 'Viewer');
    }
  }, [adminSession]);

  useEffect(() => {
    // 'security' is every admin's own account panel, not a role-gated resource.
    if (activeTab !== 'security' && !allowedAdminTabs.includes(activeTab)) {
      setActiveTab(allowedAdminTabs[0] || 'dashboard');
    }
  }, [selectedAdminRole, activeTab, allowedAdminTabs]);

  useEffect(() => {
    loadOrders();
    loadCustomers();
    loadReviews();
    loadCmsData();
    adminApi.fetchOffers().then(data => setOffers(data.map(normalizeOffer))).catch(() => {});
    loadCoupons();
    adminApi.fetchDeliveryZones().then(setDeliveryZones).catch(() => {});
    adminApi.fetchCategories().then(setDbCategories).catch(() => {});
    adminApi.fetchAdminUsers().then(setAdminAccounts).catch(() => {});
    loadInventory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'cms') {
      loadCmsData();
    } else if (activeTab === 'inventory') {
      loadInventory(false);
      if (inventoryFilter === 'logs' && !inventoryLogs) loadInventoryLogs(false);
    } else if (activeTab === 'orders') {
      loadOrders();
    } else if (activeTab === 'customers') {
      loadCustomers();
    } else if (activeTab === 'reviews') {
      loadReviews();
    } else if (activeTab === 'promotions') {
      loadCoupons();
      // Was 5s — on Workers+Hyperdrive, every poll opens a fresh DB
      // connection (unlike Vercel's pooled model), so this alone could
      // burn ~17k Hyperdrive queries/day from a single open tab. 60s is
      // still responsive enough for a coupons list that rarely changes.
      const interval = setInterval(() => {
        loadCoupons();
      }, 60000);
      return () => clearInterval(interval);
    } else if (activeTab === 'broadcast' && selectedBroadcastEmails.length === 0) {
      // Default to "all customers" only when nothing's been picked yet —
      // e.g. arriving here via the Customer Hub's "Message" button already
      // set a single recipient, which this must not clobber.
      selectBroadcastSegment('all');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, inventoryFilter, loadCoupons]);

  // Real-time broadcast sync for coupons and orders
  useEffect(() => {
    const unsubscribe = subscribeSync(
      [SYNC_EVENTS.SITE_DATA_CHANGED, SYNC_EVENTS.ORDER_PLACED, SYNC_EVENTS.ORDERS_CHANGED, SYNC_EVENTS.REFRESH_ALL],
      () => {
        loadCoupons();
        loadOrders();
      }
    );
    return () => unsubscribe();
  }, [loadCoupons]);


  // Real-time order notifications
  useEffect(() => {
    if (!adminSession) return;

    const interval = setInterval(async () => {
      try {
        const freshOrders = await adminApi.fetchAllOrders();
        if (Array.isArray(freshOrders)) {
          setLiveOrders(prev => {
            if (prev !== null && freshOrders.length > prev.length) {
              const prevIds = new Set(prev.map(o => o.id));
              const newOrders = freshOrders.filter(o => !prevIds.has(o.id));
              if (newOrders.length > 0) {
                const latest = newOrders[0];
                playChime();
                setNewOrderToast({
                  id: latest.id,
                  total: latest.total,
                  msg: `New Order placed: Order #${latest.id} for ₹${latest.total}!`
                });
                setTimeout(() => setNewOrderToast(null), 8000);
              }
            }
            return freshOrders;
          });
        }
      } catch (err) {
        console.error("Order polling failed:", err);
      }
      // Was 10s, runs the whole time an admin is logged in (even
      // backgrounded) — on Workers+Hyperdrive, every poll opens a fresh DB
      // connection, so this was the single biggest contributor to
      // exhausting the daily Hyperdrive quota. 45s still surfaces new
      // orders promptly without that cost.
    }, 45000);

    return () => clearInterval(interval);
  }, [adminSession, adminApi]);

  const allProducts = dbProductsList;

  const retailProducts = useMemo(() => {
    return dbProductsList.filter(p => {
      const target = p.targetType || (p.wholesalePrice ? 'wholesale' : 'retail_and_wholesale');
      return target === 'retail' || target === 'retail_and_wholesale' || target === 'both' || !p.wholesalePrice;
    });
  }, [dbProductsList]);

  const wholesaleProducts = useMemo(() => {
    return dbProductsList.filter(p => {
      const target = p.targetType || (p.wholesalePrice ? 'wholesale' : 'retail_and_wholesale');
      return target === 'wholesale' || target === 'retail_and_wholesale' || target === 'both' || Boolean(p.wholesalePrice);
    });
  }, [dbProductsList]);

  // ── Filtered Reviews ──
  const filteredReviews = useMemo(() => {
    return reviewsList.filter(rev => {
      if (reviewFilter === '5' && rev.rating !== 5) return false;
      if (reviewFilter === '4' && rev.rating !== 4) return false;
      if (reviewFilter === '3' && rev.rating !== 3) return false;
      if (reviewFilter === 'low' && rev.rating > 2) return false;
      if (reviewFilter === 'pending' && rev.status !== 'Pending') return false;

      if (reviewSearchQuery.trim()) {
        const q = reviewSearchQuery.toLowerCase();
        const matchProd = (rev.productName || '').toLowerCase().includes(q);
        const matchUser = (rev.userName || '').toLowerCase().includes(q);
        const matchTitle = (rev.title || '').toLowerCase().includes(q);
        const matchComment = (rev.comment || '').toLowerCase().includes(q);
        if (!matchProd && !matchUser && !matchTitle && !matchComment) return false;
      }
      return true;
    });
  }, [reviewsList, reviewFilter, reviewSearchQuery]);

  // Review statistics
  const reviewStats = useMemo(() => {
    const total = reviewsList.length;
    if (total === 0) return { avg: 5.0, total: 0, counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, lowCount: 0 };
    const sum = reviewsList.reduce((acc, r) => acc + r.rating, 0);
    const avg = Number((sum / total).toFixed(1));
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviewsList.forEach(r => {
      if (counts[r.rating] !== undefined) counts[r.rating] += 1;
    });
    const lowCount = reviewsList.filter(r => r.rating <= 2).length;
    return { avg, total, counts, lowCount };
  }, [reviewsList]);

  // ── Product filtering ──
  const filterProductList = (productsList) => {
    return productsList.filter(p => {
      if (p.isArchived) return false;

      if (productCategoryFilter !== 'all' && p.category !== productCategoryFilter) return false;
      if (productTargetFilter !== 'all') {
        const pTarget = p.targetType || (p.wholesalePrice ? 'wholesale' : 'retail_and_wholesale');
        if (pTarget !== productTargetFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchBrand = (p.brand || '').toLowerCase().includes(q);
        const matchCategory = (p.category || '').toLowerCase().includes(q);
        const matchSubcategory = (p.subcategory || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        const matchBarcode = (p.barcode || '').toLowerCase().includes(q);
        if (!matchName && !matchBrand && !matchCategory && !matchSubcategory && !matchSku && !matchBarcode) {
          return false;
        }
      }
      return true;
    });
  };

  const filteredRetailProducts = useMemo(() => filterProductList(retailProducts), [retailProducts, searchQuery, productStatusFilter, productCategoryFilter, productTargetFilter]);
  const filteredWholesaleProducts = useMemo(() => filterProductList(wholesaleProducts), [wholesaleProducts, searchQuery, productStatusFilter, productCategoryFilter, productTargetFilter]);
  const filteredCatalogProducts = useMemo(() => filterProductList(allProducts), [allProducts, searchQuery, productStatusFilter, productCategoryFilter, productTargetFilter]);
  const filteredProducts = activeTab === 'wholesale-products' ? filteredWholesaleProducts : (activeTab === 'retail-products' ? filteredRetailProducts : filteredCatalogProducts);

  // ── Filtered Orders ──
  const filteredOrders = useMemo(() => {
    if (!liveOrders) return [];
    return liveOrders.filter(order => {
      if (orderStatusFilter === 'pending' && order.status !== 'Pending') return false;
      if (orderStatusFilter === 'preparing' && order.status !== 'Preparing') return false;
      if (orderStatusFilter === 'delivered' && order.status !== 'Delivered') return false;
      if (orderStatusFilter === 'cancelled' && order.status !== 'Cancelled') return false;
      if (orderStatusFilter === 'returns' && (!order.returnStatus || order.returnStatus === 'None')) return false;

      if (orderPaymentFilter === 'paid' && order.paymentStatus !== 'Paid') return false;
      if (orderPaymentFilter === 'unpaid' && (order.paymentStatus === 'Paid' || ['Refunded', 'Partially Refunded'].includes(order.paymentStatus))) return false;
      if (orderPaymentFilter === 'refunded' && !['Refunded', 'Partially Refunded'].includes(order.paymentStatus)) return false;

      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase();
        const matchId = String(order.id).includes(q);
        const matchBill = `bill-${order.id + 7820}`.includes(q);
        const matchCust = (order.customerName || '').toLowerCase().includes(q);
        const matchPhone = (order.customerPhone || '').toLowerCase().includes(q);
        const matchEmail = (order.customerEmail || '').toLowerCase().includes(q);
        const matchAddr = (order.deliveryAddress || '').toLowerCase().includes(q);
        const matchTxn = (order.paymentTxnId || '').toLowerCase().includes(q);
        const matchTracking = (order.trackingNumber || '').toLowerCase().includes(q);
        if (!matchId && !matchBill && !matchCust && !matchPhone && !matchEmail && !matchAddr && !matchTxn && !matchTracking) {
          return false;
        }
      }
      return true;
    });
  }, [liveOrders, orderStatusFilter, orderPaymentFilter, orderSearchQuery]);

  // ── Filtered Customers ──
  const filteredCustomers = useMemo(() => {
    if (!liveCustomers) return [];
    return liveCustomers.filter(customer => {
      if (customerSegmentFilter !== 'all' && customer.segment !== customerSegmentFilter) return false;
      if (customerSearchQuery.trim()) {
        const q = customerSearchQuery.toLowerCase();
        const matchName = (customer.name || '').toLowerCase().includes(q);
        const matchEmail = (customer.email || '').toLowerCase().includes(q);
        const matchPhone = (customer.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPhone) return false;
      }
      return true;
    });
  }, [liveCustomers, customerSegmentFilter, customerSearchQuery]);

  // ── Filtered Inventory Items ──
  const filteredInventoryItems = useMemo(() => {
    if (!inventoryData?.items) return [];
    let list = inventoryData.items;

    if (inventoryFilter === 'low-stock') {
      list = list.filter(i => i.isLowStock);
    } else if (inventoryFilter === 'out-of-stock') {
      list = list.filter(i => i.isOutOfStock);
    } else if (inventoryFilter === 'near-expiry') {
      list = list.filter(i => i.isNearExpiry);
    } else if (inventoryFilter === 'expired') {
      list = list.filter(i => i.isExpired);
    } else if (inventoryFilter === 'incoming') {
      list = list.filter(i => i.incomingStock > 0);
    }

    if (inventoryCategory !== 'all') {
      list = list.filter(i => i.category === inventoryCategory);
    }

    if (inventorySearch.trim()) {
      const q = inventorySearch.toLowerCase();
      list = list.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.brand || '').toLowerCase().includes(q) ||
        (i.batchNumber || '').toLowerCase().includes(q) ||
        String(i.productId).includes(q)
      );
    }

    return list;
  }, [inventoryData, inventoryFilter, inventoryCategory, inventorySearch]);

  const stats = [
    { label: 'Retail products', value: retailProducts.length, icon: FiPackage },
    { label: 'Wholesale products', value: wholesaleProducts.length, icon: FiPackage },
    { label: 'Total Orders', value: liveOrders ? liveOrders.length : 0, icon: FiShoppingBag },
    { label: 'Registered Customers', value: liveCustomers ? liveCustomers.length : 0, icon: FiUsers },
    { label: 'Customer Reviews', value: reviewsList.length, icon: FiStar },
    { label: 'Active Coupons', value: coupons.filter(c => c.active !== false).length, icon: FiGift },
  ];

  // ── Export Inventory CSV ──
  const exportInventoryCsv = () => {
    if (!inventoryData?.items) return;
    downloadCsv('siri-traders-inventory-report.csv', [
      ['Product ID', 'Name', 'Category', 'Brand', 'Weight/Unit', 'Available Stock', 'Damaged Stock', 'Returned Stock', 'Expired Stock', 'Incoming Stock', 'Cost Price (₹)', 'Selling Price (₹)', 'Stock Valuation (₹)', 'Expiry Date', 'Batch Number', 'Status'],
      ...inventoryData.items.map(i => [
        i.productId,
        i.name,
        i.category,
        i.brand || '',
        `${i.weight || ''} ${i.unit || ''}`.trim(),
        i.availableStock,
        i.damagedStock,
        i.returnedStock,
        i.expiredStock,
        i.incomingStock,
        i.costPrice,
        i.price,
        i.stockValuation,
        i.expiryDate || 'N/A',
        i.batchNumber || 'N/A',
        i.isOutOfStock ? 'OUT OF STOCK' : (i.isLowStock ? 'LOW STOCK' : 'IN STOCK')
      ])
    ]);
  };

  // ── Export Orders CSV ──
  const exportOrdersCsv = () => {
    if (!liveOrders) return;
    downloadCsv('siri-traders-orders-report.csv', [
      ['Order ID', 'Bill Number', 'Customer Name', 'Phone', 'Email', 'Total (₹)', 'Payment Method', 'Payment Status', 'Txn Ref', 'Order Status', 'Delivery Address', 'Delivery Slot', 'Placed Date', 'Refund Amount (₹)'],
      ...liveOrders.map(o => [
        o.id,
        `BILL-${o.id + 7820}`,
        o.customerName || 'Customer',
        o.customerPhone || '',
        o.customerEmail || '',
        o.total,
        o.paymentMethod || 'COD',
        o.paymentStatus || 'Pending',
        o.paymentTxnId || '',
        o.status,
        o.deliveryAddress || '',
        o.deliverySlot || '',
        o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : '',
        o.refundAmount || 0
      ])
    ]);
  };

  // ── Handle Stock Adjustment Submit ──
  const handleStockAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustModalItem) return;
    const qty = parseInt(adjustForm.quantity, 10);
    const isInvalid = isNaN(qty) || (adjustForm.changeType === 'SET' ? qty < 0 : qty <= 0);
    if (isInvalid) {
      alert(adjustForm.changeType === 'SET' ? 'Please enter a valid quantity (0 or greater)' : 'Please enter a valid positive quantity');
      return;
    }

    setAdjustLoading(true);
    try {
      await adminApi.adjustStock({
        productId: adjustModalItem.productId,
        changeType: adjustForm.changeType,
        quantity: qty,
        targetField: adjustForm.targetField,
        reason: adjustForm.reason,
        notes: adjustForm.notes
      });
      // The save itself is already done — close the modal and show success
      // right away instead of leaving "Saving..." up while the full
      // inventory list (every product) refetches in the background.
      setAdjustModalItem(null);
      setAdjustForm({
        changeType: 'ADD',
        quantity: '',
        targetField: 'availableStock',
        reason: 'Purchase / New Stock Received',
        notes: ''
      });
      setSaveToast({ type: 'success', msg: `Stock adjusted successfully for ${adjustModalItem.name}` });
      setTimeout(() => setSaveToast(null), 4000);
      loadInventory();
    } catch (err) {
      alert('Stock adjustment failed: ' + err.message);
    } finally {
      setAdjustLoading(false);
    }
  };

  // ── Open Product History Modal ──
  const openProductHistory = async (item) => {
    setHistoryModalItem(item);
    setHistoryLoading(true);
    try {
      const logs = await adminApi.fetchInventoryLogs(item.productId);
      setHistoryLogs(logs);
    } catch (err) {
      console.error('Failed to load product history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Handle Order Update (Status / Notes / Refund / Cancel) ──
  const handleUpdateOrder = async (orderId, updatePayload, successMsg) => {
    setOrderActionLoading(true);
    try {
      const updated = await adminApi.updateOrder(orderId, updatePayload);
      setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } : o));
      if (selectedOrderModal && selectedOrderModal.id === orderId) {
        setSelectedOrderModal(prev => ({ ...prev, ...updated }));
      }
      setSaveToast({ type: 'success', msg: successMsg || `Order #${orderId} updated successfully` });
      setTimeout(() => setSaveToast(null), 4000);
      loadInventory();
    } catch (err) {
      alert('Failed to update order: ' + err.message);
    } finally {
      setOrderActionLoading(false);
    }
  };

  const parseOrderDate = (dateVal) => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return dateVal;
    let cleanStr = String(dateVal).trim().replace(' ', 'T');
    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const getOrderRevenue = (order) => {
    if (!order) return 0;
    if (order.status === 'Cancelled') return 0;
    if (typeof order.total === 'number') return order.total - (order.refundAmount || 0);
    if (order.total != null && !Number.isNaN(Number(order.total))) return Number(order.total) - (order.refundAmount || 0);
    return (order.items || []).reduce((sum, item) => sum + (Number(item.price) || 0) * (parseInt(item.quantity || 1, 10)), 0);
  };

  // ── Comprehensive Analytics Engine ──
  const analyticsSummary = useMemo(() => {
    const days = parseInt(analyticsTimeRange, 10) || 30;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const periodOrders = (liveOrders || []).filter(order => {
      const d = parseOrderDate(order.createdAt);
      return d && d >= start && d <= end;
    });

    const grossRevenue = periodOrders.filter(o => o.status !== 'Cancelled').reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalRefunds = periodOrders.reduce((sum, o) => sum + Number(o.refundAmount || 0), 0);
    const netRevenue = grossRevenue - totalRefunds;
    const validOrdersCount = periodOrders.filter(o => o.status !== 'Cancelled').length;
    const aov = validOrdersCount > 0 ? Math.round(netRevenue / validOrdersCount) : 0;
    const totalUnitsSold = periodOrders.filter(o => o.status !== 'Cancelled').reduce((sum, o) => sum + (o.items || []).reduce((is, it) => is + parseInt(it.quantity || 1, 10), 0), 0);

    // Category breakdown
    const categorySales = {};
    // Brand breakdown
    const brandSales = {};
    // Product sales
    const prodSales = {};
    // Area breakdown
    const areaSales = {};

    periodOrders.filter(o => o.status !== 'Cancelled').forEach(o => {
      const area = (o.deliveryAddress || '').split(',').slice(-2)[0]?.trim() || 'Kukatpally';
      if (!areaSales[area]) areaSales[area] = { orders: 0, revenue: 0 };
      areaSales[area].orders += 1;
      areaSales[area].revenue += getOrderRevenue(o);

      (o.items || []).forEach(it => {
        const prod = allProducts.find(p => p.id === it.productId || p.name === it.name) || {};
        const cat = prod.category || 'Grocery';
        const brand = prod.brand || 'Siri Select';
        const q = parseInt(it.quantity || 1, 10);
        const rev = (it.price || 0) * q;

        categorySales[cat] = (categorySales[cat] || 0) + rev;
        brandSales[brand] = (brandSales[brand] || 0) + rev;

        const pId = it.productId || it.name;
        if (!prodSales[pId]) prodSales[pId] = { name: it.name, brand, category: cat, units: 0, revenue: 0 };
        prodSales[pId].units += q;
        prodSales[pId].revenue += rev;
      });
    });

    const fastMoving = Object.values(prodSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const slowMoving = allProducts.filter(p => !prodSales[p.id] && p.inStock).slice(0, 5);

    // Wastage & Expired losses from inventory
    const wastageLoss = (inventoryData?.items || []).reduce((sum, it) => sum + ((it.damagedStock || 0) + (it.expiredStock || 0)) * (it.costPrice || Math.round(it.price * 0.78)), 0);

    // Customer repeat rate
    const totalCust = liveCustomers?.length || 1;
    const returningCust = (liveCustomers || []).filter(c => (c.ordersCount || 0) >= 2).length;
    const repeatRate = Math.round((returningCust / totalCust) * 100);

    return {
      grossRevenue,
      netRevenue,
      totalRefunds,
      ordersCount: validOrdersCount,
      totalUnitsSold,
      aov,
      repeatRate,
      wastageLoss,
      categorySales: Object.entries(categorySales).sort((a, b) => b[1] - a[1]),
      brandSales: Object.entries(brandSales).sort((a, b) => b[1] - a[1]),
      fastMoving,
      slowMoving,
      areaSales: Object.entries(areaSales).sort((a, b) => b[1].revenue - a[1].revenue)
    };
  }, [liveOrders, liveCustomers, inventoryData, allProducts, analyticsTimeRange]);

  const salesTrendData = useMemo(() => {
    const days = parseInt(analyticsTimeRange, 10) || 30;
    const now = new Date();
    return Array.from({ length: Math.min(days, 30) }, (_, index) => {
      const step = Math.min(days, 30);
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (step - 1 - index), 0, 0, 0, 0);
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
      const revenue = (liveOrders || []).reduce((sum, order) => {
        const date = parseOrderDate(order.createdAt);
        if (!date || date < day || date > dayEnd) return sum;
        return sum + getOrderRevenue(order);
      }, 0);
      return {
        date: day,
        label: day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        revenue
      };
    });
  }, [liveOrders, analyticsTimeRange]);

  const handleAdminLogout = async () => {
    await adminApi.logout();
    setAdminSession(null);
    navigate('/admin-login');
  };

  // ── Wholesale price range tier rows ──
  const addVariantRow = (label = '', price = '') => {
    setDetailedVariants(prev => [...prev, { id: `var-${Date.now()}-${Math.random()}`, label, price, unit: productDraft.unit || 'kg' }]);
  };
  const updateVariantRow = (idx, field, value) => {
    setDetailedVariants(prev => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));
  };
  const removeVariantRow = (idx) => setDetailedVariants(prev => prev.filter((_, i) => i !== idx));

  // Downscales and re-encodes any image to WebP before upload.
  // WebP is 25-35% smaller than JPEG and 60-80% smaller than PNG at same quality.
  // Falls back to the original file if canvas/WebP is unsupported or the output
  // would be larger than the original.
  const compressImageFile = (file, maxDimension = 1200, quality = 0.82) => new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        // Only use WebP output if it's smaller than original
        if (blob.size >= file.size && file.size < 200 * 1024) {
          resolve(file);
          return;
        }
        const webpName = file.name.replace(/\.[^.]+$/, '.webp');
        resolve(new File([blob], webpName, { type: 'image/webp' }));
      }, 'image/webp', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });

  // Uploads the picked file to Vercel Blob storage and stores the returned
  // URL on the draft — images used to be embedded as base64 text directly in
  // the DB row, which is what blew through the Neon data-transfer quota.
  const uploadDraftImage = async (file, setDraft) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setDraft(prev => ({ ...prev, image: previewUrl }));
    setImageUploading(true);
    try {
      const compressed = await compressImageFile(file);
      const url = await adminApi.uploadImage(compressed);
      setDraft(prev => ({ ...prev, image: url }));
      URL.revokeObjectURL(previewUrl);
    } catch (err) {
      alert(err.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  // ── Category management ──
  const handleCategoryImageUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    uploadDraftImage(file, setCategoryDraft);
  };

  const saveCategory = async () => {
    if (!categoryDraft.name.trim()) return;
    setCategoryLoading(true);
    try {
      const saved = await adminApi.createCategory({
        name: categoryDraft.name.trim(),
        image: categoryDraft.image || '',
        color: categoryDraft.color || '#F1F8E9'
      });
      setDbCategories(prev => [...prev, saved]);
      setCategoryDraft({ name: '', image: '', color: '#F1F8E9' });
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
      setSaveToast({ type: 'success', msg: `Category "${saved.name}" added` });
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setCategoryLoading(false);
    }
  };

  const deleteCategoryHandler = async (cat) => {
    if (!cat || !cat.id) return;
    if (!window.confirm(`Delete category "${cat.name}"? This also deletes all products in this category.`)) return;
    try {
      await adminApi.deleteCategory(cat.id);
      setDbCategories(prev => prev.filter(c => c.id !== cat.id));
      loadInventory();
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
      broadcastSync(SYNC_EVENTS.PRODUCTS_CHANGED);
      setSaveToast({ type: 'success', msg: `🗑️ Deleted category "${cat.name}"` });
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      alert(`Failed to delete category: ${err.message}`);
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    uploadDraftImage(file, setProductDraft);
  };

  const handleOfferImageUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    uploadDraftImage(file, setOfferDraft);
  };

  // ── Save Product ──
  const saveProduct = async (event) => {
    event.preventDefault();
    const isWholesale = productModalMode === 'wholesale';

    const matchedCategory = dbCategories.find(c => c.id === productDraft.category || c.name === productDraft.category);
    const targetCatId = matchedCategory ? matchedCategory.id : (productDraft.category || dbCategories[0]?.id || '');

    if (!targetCatId) {
      setSaveToast({
        type: 'error',
        msg: dbCategories.length
          ? '⚠️ Please select a category before saving.'
          : '⚠️ No categories exist yet — add one first (Add New Category), then try again.'
      });
      setTimeout(() => setSaveToast(null), 6000);
      return;
    }

    const validVariants = detailedVariants.filter(v => v.label && (v.price || v.price === 0)).map(v => ({
      id: v.id || `var-${Date.now()}-${Math.random()}`,
      label: v.label,
      packSize: v.packSize || '',
      unit: v.unit || productDraft.unit || 'g',
      price: Number(v.price) || 0,
      mrp: Number(v.mrp) || Number(v.price) || 0,
      costPrice: Number(v.costPrice) || 0,
      stock: Number(v.stock) || 0,
      sku: v.sku || '',
      barcode: v.barcode || '',
      inStock: v.inStock !== false
    }));

    const basePrice = Number(productDraft.price) || (validVariants[0]?.price || 0);
    const baseCost = Number(productDraft.costPrice) || (validVariants[0]?.costPrice || Math.round(basePrice * 0.78));
    const baseMrp = Number(productDraft.mrp) || basePrice;

    const baseNext = {
      ...productDraft,
      category: targetCatId,
      targetType: productDraft.targetType || 'retail_and_wholesale',
      subcategory: productDraft.subcategory || '',
      sku: productDraft.sku || genSku(targetCatId),
      barcode: productDraft.barcode || genBarcode(),
      price: basePrice,
      mrp: baseMrp,
      costPrice: baseCost,
      discount: Number(productDraft.discount) || (baseMrp > basePrice ? Math.round(((baseMrp - basePrice) / baseMrp) * 100) : 0),
      hsnCode: productDraft.hsnCode || '',
      batchNumber: productDraft.batchNumber || `BAT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      mfgDate: productDraft.mfgDate || '',
      expiryDate: productDraft.expiryDate || '',
      image: (productDraft.image || '').trim(),
      inStock: productDraft.stockNote !== 'Out of stock',
      isPublished: productDraft.isPublished !== false,
      isArchived: Boolean(productDraft.isArchived),
      isBestseller: Boolean(productDraft.isBestseller),
      isTodaysDeal: Boolean(productDraft.isTodaysDeal),
      variants: validVariants
    };
    
    let nextProduct = baseNext;
    if (isWholesale || productDraft.targetType === 'wholesale') {
      nextProduct = {
        ...baseNext,
        wholesalePrice: Number(productDraft.wholesalePrice) || baseNext.price,
        bulkPackLabel: productDraft.bulkPackLabel || '',
        bulkPackPrice: Number(productDraft.bulkPackPrice) || 0,
        wholesaleCaseLabel: productDraft.wholesaleCaseLabel || '',
        wholesaleCasePrice: Number(productDraft.wholesaleCasePrice) || 0
      };
    }
    
    setApiLoading(true);
    setSaveToast(null);
    // Items added together share a group id so the storefront links them as siblings.
    const siblingGroupId = additionalItems.some(a => a.name && a.name.trim())
      ? `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      : null;
    const numericId = Number(productDraft.id);
    const isEdit = Boolean(productDraft.id != null && String(productDraft.id).trim() !== '' && !isNaN(numericId) && numericId > 0);
    try {
      const targetId = isEdit ? numericId : null;
      const { stockNote, id: _id, ...apiPayload } = nextProduct;
      if (!isEdit && siblingGroupId) apiPayload.siblingGroup = siblingGroupId;
      if (isEdit) {
        const saved = await adminApi.updateProduct(targetId, apiPayload);
        nextProduct = { ...nextProduct, ...saved };
      } else {
        const saved = await adminApi.createProduct(apiPayload);
        nextProduct = { ...nextProduct, ...saved };
      }
    } catch (err) {
      // Save actually failed — show the real error and leave the modal open
      // so it's obvious nothing was saved, instead of pretending it worked.
      setSaveToast({ type: 'error', msg: `⚠️ DB error: ${err.message}` });
      setTimeout(() => setSaveToast(null), 8000);
      setApiLoading(false);
      return;
    }
    setApiLoading(false);

    loadInventory();
    broadcastSync(SYNC_EVENTS.PRODUCTS_CHANGED);

    const failedAdds = [];
    // Save additional chained sibling items if adding a new product
    if (!isEdit && additionalItems.length > 0) {
      const firstProductImage = (nextProduct.image || '').trim();
      const sharedCategory = nextProduct.category;
      const sharedBrand = nextProduct.brand;
      const sharedTarget = nextProduct.targetType;

      for (let i = 0; i < additionalItems.length; i++) {
        const itemDraft = additionalItems[i];
        if (!itemDraft.name || !itemDraft.name.trim()) continue;

        const itemPrice = Number(itemDraft.price) || 0;
        const itemMrp = Number(itemDraft.mrp) || itemPrice;
        const itemCost = Number(itemDraft.costPrice) || Math.round(itemPrice * 0.78);
        const itemWholesale = Number(itemDraft.wholesalePrice) || (sharedTarget === 'wholesale' ? itemPrice : 0);

        // Each product can have its separate image, but if not provided, default to first product's image!
        const itemImage = (itemDraft.image || firstProductImage || '').trim();

        const itemVariants = (itemDraft.variants || []).filter(v => v.label && (v.price || v.price === 0)).map(v => ({
          id: v.id || `var-${Date.now()}-${Math.random()}`,
          label: v.label,
          packSize: v.packSize || '',
          unit: v.unit || itemDraft.unit || productDraft.unit || 'g',
          price: Number(v.price) || 0,
          mrp: Number(v.mrp) || Number(v.price) || 0,
          costPrice: Number(v.costPrice) || 0,
          stock: Number(v.stock) || 0,
          sku: v.sku || '',
          barcode: v.barcode || '',
          inStock: v.inStock !== false
        }));

        const addPayload = {
          name: itemDraft.name.trim(),
          category: sharedCategory,
          brand: sharedBrand,
          targetType: sharedTarget,
          weight: (itemDraft.weight || '').trim(),
          unit: itemDraft.unit || productDraft.unit || 'g',
          price: itemPrice,
          mrp: itemMrp,
          costPrice: itemCost,
          wholesalePrice: itemWholesale,
          image: itemImage,
          description: itemDraft.description || productDraft.description || '',
          inStock: itemDraft.stockNote !== 'Out of stock',
          isPublished: itemDraft.isPublished !== false,
          sku: genSku(sharedCategory),
          barcode: genBarcode(),
          batchNumber: `BAT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
          bulkPackLabel: itemDraft.bulkPackLabel || '',
          bulkPackPrice: Number(itemDraft.bulkPackPrice) || 0,
          wholesaleCaseLabel: itemDraft.wholesaleCaseLabel || '',
          wholesaleCasePrice: Number(itemDraft.wholesaleCasePrice) || 0,
          variants: itemVariants,
          siblingGroup: siblingGroupId
        };

        try {
          const savedAdd = await adminApi.createProduct(addPayload);
          setDbProductsList(prev => [{ ...addPayload, ...savedAdd }, ...prev]);
        } catch (addErr) {
          console.warn(`Failed to save additional item #${i + 1}:`, addErr.message);
          failedAdds.push(`${itemDraft.name.trim()} (${addErr.message})`);
        }
      }
    }

    setProductDraft(blankProduct);
    setAdditionalItems([]);
    setDetailedVariants([]);
    setShowProductModal(false);

    // Re-sync the on-screen list with what's actually in the database, rather
    // than trusting the optimistic updates above — a save can succeed on the
    // server even when the browser reports a network error for it.
    loadProductsFromDb();

    const validAddsCount = !isEdit ? additionalItems.filter(a => a.name && a.name.trim()).length : 0;
    const totalCount = 1 + validAddsCount;
    if (!isEdit && failedAdds.length > 0) {
      setSaveToast({ type: 'error', msg: `⚠️ "${nextProduct.name}" was saved, but these items FAILED to save: ${failedAdds.join('; ')}` });
      setTimeout(() => setSaveToast(null), 15000);
    } else if (!isEdit) {
      setSaveToast({
        type: 'success',
        msg: totalCount > 1
          ? `🎉 ${totalCount} items created & linked as siblings successfully!`
          : `"${nextProduct.name}" added to catalog successfully!`
      });
      setTimeout(() => setSaveToast(null), 5000);
    } else {
      setSaveToast({ type: 'success', msg: '"' + nextProduct.name + '" updated successfully' });
      setTimeout(() => setSaveToast(null), 4000);
    }
  };

  const editProduct = (product) => {
    const isWholesale = Boolean(product.wholesalePrice);
    
    setProductDraft({
      ...product,
      subcategory: product.subcategory || '',
      sku: product.sku || genSku(product.category),
      barcode: product.barcode || genBarcode(),
      costPrice: product.costPrice != null ? String(product.costPrice) : '',
      hsnCode: product.hsnCode || '',
      batchNumber: product.batchNumber || '',
      mfgDate: product.mfgDate || '',
      expiryDate: product.expiryDate || '',
      isPublished: product.isPublished !== false,
      isArchived: Boolean(product.isArchived),
      price: String(product.price || ''),
      mrp: String(product.mrp || ''),
      discount: String(product.discount || ''),
      targetType: product.targetType || (isWholesale ? 'wholesale' : 'retail_and_wholesale'),
      wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : '',
      bulkPackLabel: product.bulkPackLabel || '',
      bulkPackPrice: product.bulkPackPrice != null ? String(product.bulkPackPrice) : '',
      wholesaleCaseLabel: product.wholesaleCaseLabel || '',
      wholesaleCasePrice: product.wholesaleCasePrice != null ? String(product.wholesaleCasePrice) : ''
    });

    if (Array.isArray(product.variants) && product.variants.length > 0) {
      setDetailedVariants(product.variants);
    } else {
      setDetailedVariants([]);
    }

    setProductModalMode(product.targetType === 'wholesale' || isWholesale ? 'wholesale' : 'retail');
    setShowProductModal(true);
  };

  const duplicateProduct = (product) => {
    const isWholesale = Boolean(product.wholesalePrice);
    const targetTab = isWholesale ? 'wholesale-products' : 'retail-products';
    const clonedVariants = (product.variants || []).map(v => ({
      ...v,
      id: `var-${Date.now()}-${Math.random()}`,
      sku: genSku(product.category),
      barcode: genBarcode()
    }));

    setProductDraft({
      ...product,
      id: '',
      name: `Copy of ${product.name}`,
      sku: genSku(product.category),
      barcode: genBarcode(),
      price: String(product.price || ''),
      mrp: String(product.mrp || ''),
      costPrice: String(product.costPrice || ''),
      discount: String(product.discount || ''),
      hsnCode: product.hsnCode || '',
      batchNumber: `BAT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      isPublished: true,
      isArchived: false,
      wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : '',
      bulkPackLabel: product.bulkPackLabel || '',
      bulkPackPrice: product.bulkPackPrice != null ? String(product.bulkPackPrice) : '',
      wholesaleCaseLabel: product.wholesaleCaseLabel || '',
      wholesaleCasePrice: product.wholesaleCasePrice != null ? String(product.wholesaleCasePrice) : ''
    });

    setDetailedVariants(clonedVariants);
    setActiveTab(targetTab);
    setProductModalMode(isWholesale ? 'wholesale' : 'retail');
    setSaveToast({ type: 'success', msg: `📋 Cloned "${product.name}" into editor draft.` });
    setShowProductModal(true);
  };

  const toggleArchiveProduct = async (product) => {
    const nextArchived = !product.isArchived;
    setDbProductsList(prev => prev.map(p => String(p.id) === String(product.id) ? { ...p, isArchived: nextArchived } : p));
    const targetId = Number(product.id) || product.id;
    if (targetId) {
      try {
        await adminApi.updateProduct(targetId, { isArchived: nextArchived });
      } catch (err) {
        console.error('Failed to update archive status:', err);
        loadProductsFromDb();
      }
    }
    setSaveToast({ type: 'success', msg: nextArchived ? `📁 Archived "${product.name}"` : `Restored "${product.name}" from archive` });
    setTimeout(() => setSaveToast(null), 3000);
  };

  const togglePublishProduct = async (product) => {
    if (!product || !product.id) return;
    const targetIdStr = String(product.id);
    const nextPub = product.isPublished === false ? true : false;

    // Synchronously update dbProductsList
    setDbProductsList(prev => {
      const exists = prev.some(p => String(p.id) === targetIdStr);
      return exists
        ? prev.map(p => String(p.id) === targetIdStr ? { ...p, isPublished: nextPub } : p)
        : [{ ...product, isPublished: nextPub }, ...prev];
    });

    // Synchronously update inventoryData items
    setInventoryData(prev => {
      if (!prev || !Array.isArray(prev.items)) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          String(item.productId) === targetIdStr ? { ...item, isPublished: nextPub } : item
        )
      };
    });

    const targetId = Number(product.id) || product.id;
    if (targetId) {
      try {
        await adminApi.updateProduct(targetId, { isPublished: nextPub });
        broadcastSync(SYNC_EVENTS.PRODUCTS_CHANGED);
      } catch (err) {
        console.error('Failed to update published status:', err);
        loadProductsFromDb();
        loadInventory();
      }
    }
    setSaveToast({
      type: 'success',
      msg: nextPub
        ? `🟢 "${product.name}" is now live on the website!`
        : `🟡 "${product.name}" removed from website (retained in Inventory Hub)`
    });
    setTimeout(() => setSaveToast(null), 4000);
  };



  const updateProductStock = async (productId, stockNote) => {
    const inStock = stockNote !== 'Out of stock';
    setDbProductsList(prev => prev.map(p => String(p.id) === String(productId) ? { ...p, stockNote, inStock } : p));
    const targetId = Number(productId) || productId;
    if (targetId) {
      adminApi.updateProduct(targetId, { inStock }).catch(() => {});
    }
  };

  const removeProduct = async (productId) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    const targetIdStr = String(productId);
    setDbProductsList(prev => prev.filter(p => String(p.id) !== targetIdStr));
    const numericId = Number(productId);
    const isDbProduct = !isNaN(numericId) && numericId > 0;
    if (isDbProduct) {
      try {
        await adminApi.deleteProduct(numericId);
        broadcastSync(SYNC_EVENTS.PRODUCTS_CHANGED);
        loadInventory();
      } catch (err) {
        console.error('Failed to delete product from database:', err);
        setSaveToast({ type: 'error', msg: `⚠️ DB deletion error: ${err.message}` });
        setTimeout(() => setSaveToast(null), 8000);
        loadProductsFromDb();
      }
    } else {
      broadcastSync(SYNC_EVENTS.PRODUCTS_CHANGED);
      loadInventory();
    }
  };

  const toggleProductFlag = async (productId, field, currentValue) => {
    const nextValue = !currentValue;
    const targetIdStr = String(productId);
    setDbProductsList(prev => prev.map(p => String(p.id) === targetIdStr ? { ...p, [field]: nextValue } : p));
    const targetId = Number(productId) || productId;
    if (targetId) {
      try {
        await adminApi.updateProduct(targetId, { [field]: nextValue });
        broadcastSync(SYNC_EVENTS.PRODUCTS_CHANGED);
      } catch (err) {
        alert(`Failed to update ${field}: ${err.message}`);
        loadProductsFromDb();
      }
    }
  };

  const saveOffer = async (event, forceGroup) => {
    event.preventDefault();
    const priceNum = Number(offerDraft.price) || 0;
    const mrpNum = Number(offerDraft.mrp) || 0;
    if (priceNum > 2147483647 || mrpNum > 2147483647) {
      alert("Deal Price or MRP is too large. Maximum allowed value is ₹99,99,999.");
      return;
    }

    const festiveKeywords = /diwali|eid|holi|christmas|navratri|rakhi|onam|sankranti|ramzan|ugadi|ganesh|dussehra|festival|wedding|party/i;
    const group = forceGroup || (festiveKeywords.test(offerDraft.title + ' ' + offerDraft.badge) ? 'festival' : (offerDraft.group || 'daily'));
    const payload = {
      ...offerDraft,
      group,
      price: Math.min(2147483647, Math.max(0, priceNum)),
      mrp: Math.min(2147483647, Math.max(0, mrpNum)),
      buyQty: Number(offerDraft.buyQty) || 1,
      getQty: Number(offerDraft.getQty) || 1,
      targetCategory: offerDraft.targetCategory || null,
      targetProductId: offerDraft.targetProductId ? Number(offerDraft.targetProductId) : null,
      itemsIncluded: offerDraft.itemsIncluded || offerDraft.subtitle || '',
      comboItems: Array.isArray(offerDraft.comboItems) ? offerDraft.comboItems : [],
      startDate: offerDraft.startDate || null,
      endDate: offerDraft.endDate || null,
      usageLimit: offerDraft.usageLimit ? Number(offerDraft.usageLimit) : null,
      active: offerDraft.active !== false,
      image: (offerDraft.image || '').trim()
    };
    try {
      const saved = normalizeOffer(await adminApi.saveOffer(payload));
      setOffers(prev => [saved, ...prev.filter(offer => offer.id !== saved.id)]);
      setOfferDraft(blankOffer);
      setSaveToast({ type: 'success', msg: `🎁 Promotion "${saved.title}" saved successfully!` });
      setTimeout(() => setSaveToast(null), 4000);
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
    } catch (err) {
      alert(err.message || 'Failed to save offer');
    }
  };

  const addComboItemToOffer = (prodId) => {
    if (!prodId) return;
    const prod = dbProductsList.find(p => String(p.id) === String(prodId));
    if (!prod) return;

    setOfferDraft(prev => {
      const existingList = Array.isArray(prev.comboItems) ? prev.comboItems : [];
      const existingIndex = existingList.findIndex(item => String(item.productId) === String(prod.id));

      let updatedList;
      if (existingIndex >= 0) {
        updatedList = existingList.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        updatedList = [
          ...existingList,
          {
            productId: prod.id,
            name: prod.name,
            price: prod.price,
            mrp: prod.mrp || prod.price,
            weight: `${prod.weight || ''}${prod.unit || ''}`,
            image: prod.image,
            quantity: 1
          }
        ];
      }

      const totalMrp = updatedList.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0);
      const totalRegularPrice = updatedList.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const autoItemsText = updatedList.map(i => `${i.quantity}x ${i.name} (${i.weight})`).join(', ');

      const discVal = (prev.discountAmount !== undefined && prev.discountAmount !== '') ? Number(prev.discountAmount) || 0 : 0;
      const finalPrice = discVal > 0 ? Math.max(0, totalRegularPrice - discVal) : totalRegularPrice;

      return {
        ...prev,
        comboItems: updatedList,
        mrp: totalMrp,
        price: finalPrice,
        discountAmount: prev.discountAmount !== undefined ? prev.discountAmount : '',
        title: prev.title || `Festive Combo Pack (${updatedList.length} Items)`,
        badge: discVal > 0 ? `SAVE ₹${discVal} ON COMBO` : (prev.badge || 'FESTIVE COMBO DEAL'),
        itemsIncluded: autoItemsText,
        image: prev.image || ''
      };
    });
  };

  // Adds a one-off item to the combo that isn't backed by a catalog product —
  // its own name, price/MRP and image, for a festive-only bundle add-on
  // (e.g. a gift box, a branded mug) that never needs to be a real product.
  const addCustomComboItem = () => {
    const name = customComboDraft.name.trim();
    const price = Number(customComboDraft.price);
    if (!name || !price || price <= 0) {
      alert('Enter a name and a price greater than 0 for the custom item.');
      return;
    }
    const mrp = Number(customComboDraft.mrp) || price;
    const customId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setOfferDraft(prev => {
      const existingList = Array.isArray(prev.comboItems) ? prev.comboItems : [];
      const updatedList = [
        ...existingList,
        { productId: customId, isCustom: true, name, price, mrp, weight: '', image: customComboDraft.image || '', quantity: 1 }
      ];

      const totalMrp = updatedList.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0);
      const totalRegularPrice = updatedList.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const autoItemsText = updatedList.map(i => `${i.quantity}x ${i.name}${i.weight ? ` (${i.weight})` : ''}`).join(', ');
      const discVal = (prev.discountAmount !== undefined && prev.discountAmount !== '') ? Number(prev.discountAmount) || 0 : 0;
      const finalPrice = discVal > 0 ? Math.max(0, totalRegularPrice - discVal) : totalRegularPrice;

      return {
        ...prev,
        comboItems: updatedList,
        mrp: totalMrp,
        price: finalPrice,
        title: prev.title || `Festive Combo Pack (${updatedList.length} Items)`,
        badge: discVal > 0 ? `SAVE ₹${discVal} ON COMBO` : (prev.badge || 'FESTIVE COMBO DEAL'),
        itemsIncluded: autoItemsText,
        image: prev.image || ''
      };
    });
    setCustomComboDraft({ name: '', price: '', mrp: '', image: '' });
  };

  const handleCustomComboImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setCustomComboDraft(prev => ({ ...prev, image: previewUrl }));
    setCustomComboImageUploading(true);
    try {
      const compressed = await compressImageFile(file);
      const url = await adminApi.uploadImage(compressed);
      setCustomComboDraft(prev => ({ ...prev, image: url }));
      URL.revokeObjectURL(previewUrl);
    } catch (err) {
      alert(err.message || 'Failed to upload image');
    } finally {
      setCustomComboImageUploading(false);
    }
  };

  const removeComboItemFromOffer = (prodId) => {
    setOfferDraft(prev => {
      const existingList = Array.isArray(prev.comboItems) ? prev.comboItems : [];
      const updatedList = existingList.filter(i => String(i.productId) !== String(prodId));
      const totalMrp = updatedList.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0);
      const totalRegularPrice = updatedList.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const autoItemsText = updatedList.map(i => `${i.quantity}x ${i.name} (${i.weight})`).join(', ');
      const discVal = Number(prev.discountAmount) || 0;
      const finalPrice = discVal > 0 ? Math.max(0, totalRegularPrice - discVal) : totalRegularPrice;

      return {
        ...prev,
        comboItems: updatedList,
        mrp: totalMrp,
        price: finalPrice,
        itemsIncluded: autoItemsText
      };
    });
  };

  const updateComboItemQty = (prodId, newQty) => {
    if (newQty <= 0) {
      removeComboItemFromOffer(prodId);
      return;
    }
    setOfferDraft(prev => {
      const existingList = Array.isArray(prev.comboItems) ? prev.comboItems : [];
      const updatedList = existingList.map(i =>
        String(i.productId) === String(prodId) ? { ...i, quantity: newQty } : i
      );
      const totalMrp = updatedList.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0);
      const totalRegularPrice = updatedList.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const autoItemsText = updatedList.map(i => `${i.quantity}x ${i.name} (${i.weight})`).join(', ');
      const discVal = Number(prev.discountAmount) || 0;
      const finalPrice = discVal > 0 ? Math.max(0, totalRegularPrice - discVal) : totalRegularPrice;

      return {
        ...prev,
        comboItems: updatedList,
        mrp: totalMrp,
        price: finalPrice,
        itemsIncluded: autoItemsText
      };
    });
  };

  const editFestiveOffer = (offer) => {
    let parsedCombo = [];
    if (offer.comboItems) {
      try {
        parsedCombo = typeof offer.comboItems === 'string' ? JSON.parse(offer.comboItems) : offer.comboItems;
      } catch {
        parsedCombo = [];
      }
    }
    const comboList = Array.isArray(parsedCombo) ? parsedCombo : [];
    const comboRegPrice = comboList.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const comboMrpPrice = comboList.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0);
    const baseVal = comboRegPrice || comboMrpPrice || Number(offer.mrp || 0);
    const discAmt = (offer.price !== undefined && offer.price !== null && baseVal > Number(offer.price))
      ? baseVal - Number(offer.price)
      : '';

    setOfferDraft({
      ...blankOffer,
      ...offer,
      discountAmount: discAmt !== '' ? discAmt : (offer.discountAmount ?? ''),
      comboItems: comboList
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editCoupon = (coupon) => {
    setCouponDraft({
      ...blankCoupon,
      ...coupon,
      value: coupon.value ?? '',
      minOrder: coupon.minOrder ?? '',
      maxDiscount: coupon.maxDiscount ?? '',
      usageLimit: coupon.usageLimit ?? 500,
      perUserLimit: coupon.perUserLimit ?? 1,
      startDate: coupon.startDate || '',
      endDate: coupon.endDate || '',
      title: coupon.title || '',
      description: coupon.description || '',
      targetCategory: coupon.targetCategory || '',
      targetProductId: coupon.targetProductId || '',
      targetCustomerEmail: coupon.targetCustomerEmail || '',
    });
    const formEl = document.getElementById('coupon-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const saveCoupon = async (event) => {
    event.preventDefault();
    const isEdit = Boolean(couponDraft.id);
    const codeUpper = String(couponDraft.code || '').trim().toUpperCase();
    if (!codeUpper) {
      alert('Please enter a valid coupon code.');
      return;
    }
    const payload = {
      ...couponDraft,
      code: codeUpper,
      value: Number(couponDraft.value) || 0,
      minOrder: Number(couponDraft.minOrder) || 0,
      maxDiscount: couponDraft.maxDiscount ? Number(couponDraft.maxDiscount) : null,
      buyQuantity: Number(couponDraft.buyQuantity) || 1,
      getQuantity: Number(couponDraft.getQuantity) || 1,
      targetType: couponDraft.targetType || 'all',
      targetCategory: couponDraft.targetCategory || null,
      targetProductId: couponDraft.targetProductId ? Number(couponDraft.targetProductId) : null,
      targetCustomerEmail: couponDraft.targetCustomerEmail || null,
      usageLimit: couponDraft.usageLimit ? Number(couponDraft.usageLimit) : 500,
      perUserLimit: Number(couponDraft.perUserLimit) || 1,
      startDate: couponDraft.startDate || null,
      endDate: couponDraft.endDate || null
    };
    try {
      const saved = isEdit ? await adminApi.updateCoupon(couponDraft.id, payload) : await adminApi.saveCoupon(payload);
      setCoupons(prev => [saved, ...prev.filter(coupon => coupon.id !== saved.id && coupon.code !== saved.code)]);
      setCouponDraft(blankCoupon);
      setSaveToast({ type: 'success', msg: isEdit ? `✏️ Coupon "${saved.code}" updated successfully!` : `🎟️ Coupon "${saved.code}" saved and active!` });
      setTimeout(() => setSaveToast(null), 4000);
      broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
      refreshSiteData();
    } catch (err) {
      alert(err.message || 'Failed to save coupon.');
    }
  };

  const saveAdmin = async (event) => {
    event.preventDefault();
    setAdminError('');
    const email = adminDraft.email.trim().toLowerCase();
    if (!adminDraft.name.trim() || !email || !adminDraft.password.trim()) return;
    try {
      const created = await adminApi.createAdminUser({
        name: adminDraft.name.trim(),
        email,
        password: adminDraft.password,
        role: adminDraft.role
      });
      const refreshed = await adminApi.fetchAdminUsers();
      setAdminAccounts(refreshed);
      setAdminDraft(blankAdmin);
      setSaveToast({
        type: created.emailSent ? 'success' : 'error',
        msg: created.emailSent
          ? `✅ ${created.name} added as ${created.role}. Welcome email with login details sent.`
          : `⚠️ ${created.name} added as ${created.role}, but the welcome email failed to send — share their password manually.`
      });
      setTimeout(() => setSaveToast(null), 6000);
    } catch (err) {
      setAdminError(err.message || 'Failed to create admin');
    }
  };

  // ── Change an existing admin's role or password ──
  const updateAdminRole = async (account, nextRole) => {
    try {
      const updated = await adminApi.updateAdminUser(account.id, { role: nextRole });
      setAdminAccounts(prev => prev.map(a => a.id === account.id ? { ...a, ...updated } : a));
    } catch (err) {
      alert(`Failed to update role: ${err.message}`);
    }
  };

  const resetAdminPassword = async (account) => {
    const nextPassword = window.prompt(`New password for ${account.name} (min 8 characters):`);
    if (!nextPassword) return;
    if (nextPassword.trim().length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    try {
      const updated = await adminApi.updateAdminUser(account.id, { password: nextPassword.trim() });
      setSaveToast({
        type: updated.emailSent ? 'success' : 'error',
        msg: updated.emailSent
          ? `✅ Password changed for ${account.name}. Notification email sent.`
          : `⚠️ Password changed for ${account.name}, but the notification email failed to send — share the new password manually.`
      });
      setTimeout(() => setSaveToast(null), 6000);
    } catch (err) {
      alert(`Failed to change password: ${err.message}`);
    }
  };

  const changeOwnPassword = async (event) => {
    event.preventDefault();
    setPasswordChangeStatus(null);

    if (passwordForm.newPassword.length < 8) {
      setPasswordChangeStatus({ type: 'error', msg: 'New password must be at least 8 characters.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordChangeStatus({ type: 'error', msg: "New password and confirmation don't match." });
      return;
    }

    setPasswordChangeLoading(true);
    try {
      await adminApi.changeOwnPassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordChangeStatus({ type: 'success', msg: '✅ Password changed successfully.' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordChangeStatus({ type: 'error', msg: err.message || 'Failed to change password.' });
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const updateProductField = (productId, field, value) => {
    const targetIdStr = String(productId);
    const parsedVal = ['price', 'mrp', 'discount', 'costPrice'].includes(field) ? Number(value) || 0 : value;
    setDbProductsList(prev => prev.map(p => {
      if (String(p.id) !== targetIdStr) return p;
      return {
        ...p,
        [field]: parsedVal,
        inStock: field === 'stockNote' ? value !== 'Out of stock' : p.inStock
      };
    }));
    const targetId = Number(productId) || productId;
    if (targetId) {
      adminApi.updateProduct(targetId, { [field]: parsedVal }).catch(() => {});
    }
  };

  if (!sessionChecked) {
    return <div className="admin-auth-required" />;
  }

  if (!adminSession) {
    return (
      <div className="admin-auth-required">
        <div className="admin-denied">
          <FiLock className="admin-denied__icon" />
          <h2>Admin login required</h2>
          <p>This admin page is separate from customer login.</p>
          <button className="admin-denied__btn" onClick={() => navigate('/admin-login')}>Go to Admin Login</button>
        </div>
      </div>
    );
  }

  const invSummary = inventoryData?.summary || {
    totalValuation: 0,
    totalRetailValuation: 0,
    totalAvailableUnits: 0,
    totalReservedUnits: 0,
    totalDamagedUnits: 0,
    totalReturnedUnits: 0,
    totalExpiredUnits: 0,
    totalIncomingUnits: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    nearExpiryCount: 0,
    expiredCount: 0
  };

  const currSellPrice = Number(productDraft.price) || 0;
  const currCostPrice = Number(productDraft.costPrice) || 0;
  const currProfitAmount = currSellPrice - currCostPrice;
  const currProfitMarginPct = currSellPrice > 0 ? Math.round(((currSellPrice - currCostPrice) / currSellPrice) * 100) : 0;

  return (
    <div className="page-wrapper admin-page-wrapper admin-habane">
      {newOrderToast && (
        <div className="admin-new-order-toast">
          <div className="admin-new-order-toast__content">
            <span className="admin-new-order-toast__icon">🛍️</span>
            <div>
              <strong>New Order Received!</strong>
              <p>{newOrderToast.msg}</p>
            </div>
          </div>
          <button className="admin-new-order-toast__close" onClick={() => setNewOrderToast(null)}>×</button>
        </div>
      )}

      {/* Mobile top header bar */}
      <div className="admin-mobile-header">
        <div className="admin-mobile-header__brand">
          <img src="/logo-mark.webp" alt="Siri Traders" className="admin-mobile-logo" />
          <span>Siri Traders Admin</span>
        </div>
        <button className="admin-mobile-hamburger" onClick={() => setMobileMenuOpen(prev => !prev)} aria-label="Toggle menu">
          <span className={`hamburger-bar ${mobileMenuOpen ? 'open' : ''}`}></span>
          <span className={`hamburger-bar ${mobileMenuOpen ? 'open' : ''}`}></span>
          <span className={`hamburger-bar ${mobileMenuOpen ? 'open' : ''}`}></span>
        </button>
      </div>

      <div className="admin-layout">
        {/* Left Sidebar */}
        <aside className={`admin-sidebar ${mobileMenuOpen ? 'admin-sidebar--open' : ''}`}>
          <div className="admin-sidebar__brand">
            <img src="/logo-mark.webp" alt="Siri Traders" className="admin-sidebar__logo" />
            <div>
              <strong>SIRI TRADERS</strong>
              <span>Control Center</span>
            </div>
          </div>
         
          <div className="admin-sidebar__user">
            <div className="admin-sidebar__avatar">
              {adminSession.name ? adminSession.name[0].toUpperCase() : 'A'}
            </div>
            <div className="admin-sidebar__user-info">
              <strong>{adminSession.name || 'Admin'}</strong>
              <span>{String(adminSession.role || 'Administrator').toUpperCase()}</span>
            </div>
          </div>

          {/* ADMIN ROLE SELECTOR */}
          <div className="admin-role-selector">
            <label htmlFor="admin-role">SELECT ADMIN ROLE</label>
            <select
              id="admin-role"
              value={selectedAdminRole}
              onChange={(e) => setSelectedAdminRole(e.target.value)}
            >
              <option value="Owner">Owner</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Product Manager">Product Manager</option>
              <option value="Order Manager">Order Manager</option>
              <option value="Marketing Manager">Marketing Manager</option>
              <option value="Content Manager">Content Manager</option>
              <option value="Customer Support">Customer Support</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>

          <nav className="admin-sidebar__nav">
            {ADMIN_NAV_SECTIONS.map(section => {
              const visibleItems = section.items.filter(([id]) => allowedAdminTabs.includes(id));
              if (visibleItems.length === 0) return null;

              return (
                <div className="admin-sidebar__section" key={section.title}>
                  <div className="admin-sidebar__section-title">
                    <span>{section.title}</span>
                  </div>

                  {visibleItems.map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      className={activeTab === id ? 'admin-sidebar__nav-item admin-sidebar__nav-item--active' : 'admin-sidebar__nav-item'}
                      onClick={() => {
                        setActiveTab(id);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <Icon />
                      <span>{label}</span>
                      {id === 'inventory' && invSummary.lowStockCount + invSummary.outOfStockCount > 0 && (
                        <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>
                          {invSummary.lowStockCount + invSummary.outOfStockCount}
                        </span>
                      )}
                      {id === 'orders' && liveOrders && (
                        <span style={{ marginLeft: 'auto', background: '#2D5016', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>
                          {liveOrders.filter(o => ['Pending', 'Preparing'].includes(o.status)).length}
                        </span>
                      )}
                      {id === 'reviews' && reviewsList.length > 0 && (
                        <span style={{ marginLeft: 'auto', background: '#F59E0B', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>
                          {reviewsList.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}

            {/* Always visible regardless of role — every admin manages their
                own account security, not gated by ADMIN_ROLE_PERMISSIONS. */}
            <div className="admin-sidebar__section">
              <div className="admin-sidebar__section-title">
                <span>ACCOUNT</span>
              </div>
              <button
                type="button"
                className={activeTab === 'security' ? 'admin-sidebar__nav-item admin-sidebar__nav-item--active' : 'admin-sidebar__nav-item'}
                onClick={() => {
                  setActiveTab('security');
                  setMobileMenuOpen(false);
                }}
              >
                <FiShield />
                <span>Security</span>
              </button>
            </div>
          </nav>

          <div className="admin-sidebar__footer">
            <button className="admin-sidebar__logout" onClick={handleAdminLogout}>
              <FiLogOut /> <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {mobileMenuOpen && (
          <div className="admin-sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
        )}

        {/* Right Main Content area */}
        <main className="admin-main">
          <header className="admin-main-header">
            <div>
              <span className="admin-main-eyebrow">Control Panel / {activeTab.replace('-', ' ')}</span>
              <h1>
                                {activeTab === 'dashboard' && 'Overview Management'}
                {activeTab === 'cms' && 'Terms & Policy'}
                {activeTab === 'inventory' && 'Grocery Inventory Hub'}
                {activeTab === 'orders' && 'Order & Payment Management'}
                {activeTab === 'customers' && 'Customer Management & Segmentation'}
                {activeTab === 'reviews' && 'Customer Reviews & Rating Moderation'}
                {activeTab === 'offers' && 'Grocery Promotions & Coupon Engine'}
                {activeTab === 'delivery-zones' && 'Delivery Zones & Coverage'}
                {activeTab === 'min-order-value' && 'Minimum Order Value Configuration'}
                {activeTab === 'retail-products' && 'Grocery Products & Variants'}
                {activeTab === 'wholesale-products' && 'Wholesale Products & Bulk Packs'}
                {activeTab === 'sales-stats' && 'Grocery Sales & Performance Analytics'}
                {activeTab !== 'dashboard' && activeTab !== 'inventory' && activeTab !== 'orders' && activeTab !== 'customers' && activeTab !== 'reviews' && activeTab !== 'offers' && activeTab !== 'delivery-zones' && activeTab !== 'min-order-value' && activeTab !== 'retail-products' && activeTab !== 'wholesale-products' && activeTab !== 'sales-stats' && activeTab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </h1>
            </div>
            
            <div className="admin-main-header__actions">
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginRight: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: homeSections?.storeOpen === false ? '#C0392B' : '#1C4B12' }}>
                  Store open?
                </span>
                <button type="button" disabled={apiLoading || homeSections?.storeOpen !== false} onClick={() => setStoreOpen(true)}
                  style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid #2D5016', fontWeight: 800, cursor: 'pointer', background: homeSections?.storeOpen !== false ? '#2D5016' : '#fff', color: homeSections?.storeOpen !== false ? '#fff' : '#2D5016' }}>Yes</button>
                <button type="button" disabled={apiLoading || homeSections?.storeOpen === false} onClick={() => setStoreOpen(false)}
                  style={{ padding: '6px 16px', borderRadius: '8px', border: '1px solid #C0392B', fontWeight: 800, cursor: 'pointer', background: homeSections?.storeOpen === false ? '#C0392B' : '#fff', color: homeSections?.storeOpen === false ? '#fff' : '#C0392B' }}>No</button>
              </div>
              <a href="/home" target="_blank" rel="noopener noreferrer" className="admin-main-header__btn">
                Launch Site →
              </a>
            </div>
          </header>

          {/* =========================================================================
             EXECUTIVE DASHBOARD OVERVIEW
             ========================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="admin-overview-page" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top 6 KPI Stat Cards */}
              <section className="admin__stats">
                {stats.map(stat => (
                  <div key={stat.label} className="admin__stat-card">
                    <stat.icon />
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </section>

              {/* Operational Action Center & Critical Alerts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                {/* Pending Orders Action Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#687466', textTransform: 'uppercase' }}>Orders To Fulfill</span>
                    <span style={{ background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                      {liveOrders ? liveOrders.filter(o => ['Pending', 'Preparing'].includes(o.status)).length : 0} Pending
                    </span>
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#111827' }}>
                      {liveOrders ? liveOrders.filter(o => ['Pending', 'Preparing'].includes(o.status)).length : 0}
                    </strong>
                    <span style={{ fontSize: '12px', color: '#687466', display: 'block', marginTop: '2px' }}>Orders requiring dispatch</span>
                  </div>
                  <button
                    type="button"
                    className="admin__primary"
                    style={{ width: '100%', height: '32px', fontSize: '12px', justifyContent: 'center' }}
                    onClick={() => setActiveTab('orders')}
                  >
                    <FiShoppingBag size={12} /> Manage Orders →
                  </button>
                </div>

                {/* Stock Alerts Action Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#687466', textTransform: 'uppercase' }}>Inventory Alerts</span>
                    <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                      {invSummary.lowStockCount + invSummary.outOfStockCount} Low/Out
                    </span>
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#111827' }}>
                      {invSummary.outOfStockCount} Out · {invSummary.lowStockCount} Low
                    </strong>
                    <span style={{ fontSize: '12px', color: '#687466', display: 'block', marginTop: '2px' }}>Items needing replenishment</span>
                  </div>
                  <button
                    type="button"
                    className="admin__ghost"
                    style={{ width: '100%', height: '32px', fontSize: '12px', justifyContent: 'center' }}
                    onClick={() => setActiveTab('inventory')}
                  >
                    <FiLayers size={12} /> View Stock Hub →
                  </button>
                </div>

                {/* Reviews Moderation Action Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#687466', textTransform: 'uppercase' }}>Store Rating</span>
                    <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                      ⭐ {reviewStats.avg} / 5.0
                    </span>
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#111827' }}>
                      {reviewsList.length} Verified Reviews
                    </strong>
                    <span style={{ fontSize: '12px', color: '#687466', display: 'block', marginTop: '2px' }}>
                      {reviewsList.filter(r => r.status === 'Pending').length} pending approval
                    </span>
                  </div>
                  <button
                    type="button"
                    className="admin__ghost"
                    style={{ width: '100%', height: '32px', fontSize: '12px', justifyContent: 'center' }}
                    onClick={() => setActiveTab('reviews')}
                  >
                    <FiStar size={12} /> Moderate Reviews →
                  </button>
                </div>

                {/* Delivery & Logistics Action Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#687466', textTransform: 'uppercase' }}>Delivery Network</span>
                    <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                      {deliveryZones.length} Zones Active
                    </span>
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px', color: '#111827' }}>Hyderabad Hyperlocal</strong>
                    <span style={{ fontSize: '12px', color: '#687466', display: 'block', marginTop: '2px' }}>15-30 min express delivery active</span>
                  </div>
                  <button
                    type="button"
                    className="admin__ghost"
                    style={{ width: '100%', height: '32px', fontSize: '12px', justifyContent: 'center' }}
                    onClick={() => setActiveTab('delivery-zones')}
                  >
                    <FiTruck size={12} /> Delivery Zones →
                  </button>
                </div>
              </div>

              {/* Recent Customer Orders Live Table (Full Width) */}
              <div className="admin-card admin-card--wide">
                <div className="admin-card__toolbar" style={{ marginBottom: '14px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '15.5px' }}>Recent Customer Orders</h2>
                    <span style={{ fontSize: '12px', color: '#687466' }}>Live incoming grocery delivery orders across Hyderabad</span>
                  </div>
                  <button className="admin__ghost" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => setActiveTab('orders')}>
                    View All Orders ({liveOrders ? liveOrders.length : 0}) →
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="inventory-table" style={{ fontSize: '12.5px' }}>
                    <thead>
                      <tr>
                        <th>ORDER #</th>
                        <th>BILL NO.</th>
                        <th>CUSTOMER</th>
                        <th>ITEMS</th>
                        <th>TOTAL (₹)</th>
                        <th>PAYMENT</th>
                        <th>ORDER STATUS</th>
                        <th style={{ textAlign: 'center' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(liveOrders || []).slice(0, 8).map(order => (
                        <tr key={order.id}>
                          <td>
                            <strong>#{order.id}</strong>
                          </td>
                          <td>
                            <code style={{ fontSize: '11px', background: '#F3F4F6', padding: '2px 6px', borderRadius: '4px' }}>
                              BILL-{order.id + 7820}
                            </code>
                          </td>
                          <td>
                            <strong>{order.customerName || 'Customer'}</strong>
                            <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>{order.customerPhone || 'Direct App Order'}</span>
                          </td>
                          <td>{(order.items || []).length} items</td>
                          <td>
                            <strong style={{ color: '#166534', fontSize: '13.5px' }}>{formatPrice(order.total)}</strong>
                          </td>
                          <td>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: order.paymentStatus === 'Paid' ? '#166534' : '#D97706'
                            }}>
                              {order.paymentStatus || 'Pending'} ({order.paymentMethod || 'COD'})
                            </span>
                          </td>
                          <td>
                            <span style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: 800,
                              background: order.status === 'Delivered' ? '#DCFCE7' : (order.status === 'Cancelled' ? '#FEE2E2' : '#FEF3C7'),
                              color: order.status === 'Delivered' ? '#166534' : (order.status === 'Cancelled' ? '#991B1B' : '#854D0E')
                            }}>
                              {order.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="admin__ghost"
                              style={{ padding: '5px 10px', fontSize: '11.5px' }}
                              onClick={() => {
                                setSelectedOrderModal(order);
                                setActiveTab('orders');
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!liveOrders || liveOrders.length === 0) && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#687466' }}>
                            No orders found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


          {/* =========================================================================
             MODULE: TERMS & POLICY PAGES
             ========================================================================= */}
          {activeTab === 'cms' && (
            <div className="admin-cms-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-card admin-card--wide">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: '0 0 4px' }}>Terms & Policy Pages ({cmsData.pages.length})</h2>
                    <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#687466' }}>
                      Edit the content shown on each legal, general and policy page of the website.
                    </p>
                  </div>
                  <button
                    className="admin__primary"
                    style={{ flexShrink: 0 }}
                    onClick={() => setNewPageDraft({ title: '', slug: '', category: 'general', content: '' })}
                  >
                    <FiPlus /> New Page
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cmsData.pages.map(page => (
                    <div key={page.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '13.5px', color: '#111827' }}>{page.title}</strong>
                        <span style={{ fontSize: '11.5px', color: '#687466', display: 'block' }}>
                          URL: <code>/info?tab={page.slug}</code> · Category: <strong>{page.category}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="admin__ghost" style={{ padding: '6px 10px', fontSize: '11.5px' }} onClick={() => setEditingPage(page)}>
                          <FiEdit2 size={12} /> Edit
                        </button>
                        <button className="admin-danger" style={{ padding: '6px 10px', fontSize: '11.5px' }} onClick={async () => {
                          if (window.confirm(`Delete page "${page.title}"?`)) {
                            await adminApi.deletePage(page.id);
                            setCmsData(prev => ({ ...prev, pages: prev.pages.filter(p => p.id !== page.id) }));
                          }
                        }}>
                          <FiTrash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {editingPage && (
                <div className="inventory-modal-backdrop" onClick={() => setEditingPage(null)}>
                  <div className="inventory-modal" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <h2 style={{ margin: 0 }}>Edit Page: {editingPage.title}</h2>
                      <button className="inventory-modal__close" onClick={() => setEditingPage(null)}>✕</button>
                    </div>

                    <div className="inventory-modal__body">
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Page Body Content</label>
                        <textarea
                          rows={16}
                          className="admin-input-box"
                          style={{ height: 'auto' }}
                          value={editingPage.content || ''}
                          onChange={e => setEditingPage(p => ({ ...p, content: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="inventory-modal__footer">
                      <button type="button" className="admin__ghost" onClick={() => setEditingPage(null)}>Cancel</button>
                      <button
                        type="button"
                        className="admin__primary"
                        onClick={async () => {
                          try {
                            const updated = await adminApi.updatePage(editingPage.id, { ...editingPage, isPublished: true });
                            setCmsData(prev => ({ ...prev, pages: prev.pages.map(p => p.id === updated.id ? updated : p) }));
                            setEditingPage(null);
                            setSaveToast({ type: 'success', msg: 'Page content updated' });
                            setTimeout(() => setSaveToast(null), 3000);
                          } catch (err) { alert(err.message); }
                        }}
                      >
                        <FiSave /> Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {newPageDraft && (
                <div className="inventory-modal-backdrop" onClick={() => setNewPageDraft(null)}>
                  <div className="inventory-modal" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <h2 style={{ margin: 0 }}>New Page</h2>
                      <button className="inventory-modal__close" onClick={() => setNewPageDraft(null)}>✕</button>
                    </div>

                    <div className="inventory-modal__body">
                      <div className="admin-form__grid admin-form__grid--two">
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Title *</label>
                          <input
                            className="admin-input-box"
                            placeholder="e.g. Shipping Policy"
                            value={newPageDraft.title}
                            onChange={e => setNewPageDraft(p => ({ ...p, title: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Slug (URL: /info?tab=...)</label>
                          <input
                            className="admin-input-box"
                            placeholder="auto-generated from title if left blank"
                            value={newPageDraft.slug}
                            onChange={e => setNewPageDraft(p => ({ ...p, slug: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Category</label>
                        <select
                          className="admin-input-box"
                          value={newPageDraft.category}
                          onChange={e => setNewPageDraft(p => ({ ...p, category: e.target.value }))}
                        >
                          <option value="general">General</option>
                          <option value="legal">Legal</option>
                          <option value="policy">Policy</option>
                        </select>
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Page Body Content</label>
                        <textarea
                          rows={16}
                          className="admin-input-box"
                          style={{ height: 'auto' }}
                          placeholder={newPageDraft.slug === 'contact' ? 'Phone: 812570286\nEmail: siritraders250925@gmail.com\nAddress: Your address here' : ''}
                          value={newPageDraft.content}
                          onChange={e => setNewPageDraft(p => ({ ...p, content: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="inventory-modal__footer">
                      <button type="button" className="admin__ghost" onClick={() => setNewPageDraft(null)}>Cancel</button>
                      <button
                        type="button"
                        className="admin__primary"
                        disabled={!newPageDraft.title.trim()}
                        onClick={async () => {
                          try {
                            const saved = await adminApi.savePage({ ...newPageDraft, isPublished: true });
                            setCmsData(prev => ({ ...prev, pages: [...prev.pages, saved] }));
                            setNewPageDraft(null);
                            setSaveToast({ type: 'success', msg: `Page "${saved.title}" created` });
                            setTimeout(() => setSaveToast(null), 3000);
                          } catch (err) { alert(err.message); }
                        }}
                      >
                        <FiSave /> Create Page
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
             MODULE 1: REVIEWS & RATINGS MANAGEMENT
             ========================================================================= */}
          {activeTab === 'reviews' && (
            <div className="admin-reviews-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Review KPI & Rating Distribution Card */}
              <div className="admin-card admin-card--wide" style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', alignItems: 'center' }}>
                  {/* Big Average Score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderRight: '1px solid #E1E6DC', paddingRight: '20px' }}>
                    <div style={{ fontSize: '48px', fontWeight: 900, color: '#2D5016', lineHeight: 1 }}>
                      {reviewStats.avg}
                    </div>
                    <div>
                      <div className="admin-rating-stars">
                        {[1, 2, 3, 4, 5].map(s => (
                          <span key={s}>{s <= Math.round(reviewStats.avg) ? '★' : '☆'}</span>
                        ))}
                      </div>
                      <span style={{ fontSize: '12px', color: '#687466', display: 'block', marginTop: '4px' }}>
                        Based on <strong>{reviewStats.total}</strong> verified customer reviews
                      </span>
                    </div>
                  </div>

                  {/* Rating Breakdown Bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[5, 4, 3, 2, 1].map(stars => {
                      const count = reviewStats.counts[stars] || 0;
                      const pct = reviewStats.total > 0 ? Math.round((count / reviewStats.total) * 100) : 0;
                      return (
                        <div key={stars} className="admin-dist-bar-row">
                          <span style={{ width: '35px', fontWeight: 700 }}>{stars} ★</span>
                          <div className="admin-dist-bar-track">
                            <div className="admin-dist-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span style={{ width: '45px', textAlign: 'right', color: '#687466' }}>{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Low Rating Watchlist Banner */}
                  <div style={{ background: reviewStats.lowCount > 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${reviewStats.lowCount > 0 ? '#FECACA' : '#BBF7D0'}`, borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <FiAlertTriangle style={{ color: reviewStats.lowCount > 0 ? '#DC2626' : '#16A34A' }} />
                      <strong style={{ fontSize: '13px', color: reviewStats.lowCount > 0 ? '#991B1B' : '#166534' }}>
                        {reviewStats.lowCount > 0 ? `${reviewStats.lowCount} Low-Rated Reviews` : 'High Customer Satisfaction'}
                      </strong>
                    </div>
                    <p style={{ fontSize: '11.5px', color: '#4B5563', margin: 0 }}>
                      {reviewStats.lowCount > 0
                        ? 'Items with 1-2 star ratings require quality check or packaging review.'
                        : 'No critical negative reviews found. Over 90% positive store rating.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="admin-card admin-card--wide" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="inventory-filters-tabs">
                    <button
                      className={`inventory-filter-btn ${reviewFilter === 'all' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setReviewFilter('all')}
                    >
                      All Reviews <span className="inventory-badge-count">{reviewsList.length}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${reviewFilter === '5' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setReviewFilter('5')}
                    >
                      ⭐ 5 Stars <span className="inventory-badge-count">{reviewStats.counts[5]}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${reviewFilter === '4' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setReviewFilter('4')}
                    >
                      ⭐ 4 Stars <span className="inventory-badge-count">{reviewStats.counts[4]}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${reviewFilter === '3' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setReviewFilter('3')}
                    >
                      ⭐ 3 Stars <span className="inventory-badge-count">{reviewStats.counts[3]}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${reviewFilter === 'low' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setReviewFilter('low')}
                    >
                      ⚠️ 1-2 Stars <span className="inventory-badge-count">{reviewStats.lowCount}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${reviewFilter === 'pending' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setReviewFilter('pending')}
                    >
                      🟡 Pending <span className="inventory-badge-count">{reviewsList.filter(r => r.status === 'Pending').length}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="admin-search-label" style={{ flex: 1, minWidth: '280px', maxWidth: '500px' }}>
                      <FiSearch />
                      <input
                        placeholder="Search by product, customer name or review text..."
                        value={reviewSearchQuery}
                        onChange={(e) => setReviewSearchQuery(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button className="admin__ghost" onClick={loadReviews}>
                      <FiRefreshCw size={13} /> Refresh Reviews
                    </button>
                  </div>
                </div>
              </div>

              {/* Reviews Cards Grid */}
              <div className="admin-reviews-grid">
                {filteredReviews.length === 0 ? (
                  <div className="admin-card admin-card--wide" style={{ textAlign: 'center', padding: '36px', color: '#687466', gridColumn: '1 / -1' }}>
                    No customer reviews found matching your filter criteria.
                  </div>
                ) : filteredReviews.map(rev => (
                  <div key={rev.id} className={`admin-review-card ${rev.status === 'Pending' ? 'admin-review-card--pending' : (rev.status === 'Rejected' ? 'admin-review-card--rejected' : '')}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '13.5px', color: '#111827', display: 'block' }}>
                          {rev.productName}
                        </strong>
                        <span style={{ fontSize: '11px', color: '#687466' }}>Product #{rev.productId}</span>
                      </div>
                      <span style={{
                        fontSize: '10.5px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        background: rev.status === 'Approved' ? '#DCFCE7' : (rev.status === 'Pending' ? '#FEF9C3' : '#FEE2E2'),
                        color: rev.status === 'Approved' ? '#166534' : (rev.status === 'Pending' ? '#854D0E' : '#991B1B')
                      }}>
                        {rev.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="admin-rating-stars">
                        {[1, 2, 3, 4, 5].map(s => (
                          <span key={s}>{s <= rev.rating ? '★' : '☆'}</span>
                        ))}
                      </div>
                      {rev.title && <strong style={{ fontSize: '12.5px', color: '#374151' }}>"{rev.title}"</strong>}
                    </div>

                    {rev.comment && (
                      <p style={{ fontSize: '12px', color: '#4B5563', margin: 0, lineHeight: 1.4, background: '#FAF9F5', padding: '8px 10px', borderRadius: '6px' }}>
                        {rev.comment}
                      </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#687466', marginTop: '4px' }}>
                      <span>👤 <strong>{rev.userName}</strong> (Verified Customer)</span>
                      <span>{new Date(rev.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>

                    {/* Moderation actions */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid #F1F3ED', paddingTop: '8px' }}>
                      {rev.status !== 'Approved' && (
                        <button
                          type="button"
                          className="admin__ghost"
                          style={{ flex: 1, height: '30px', fontSize: '11.5px', color: '#166534' }}
                          onClick={async () => {
                            await adminApi.updateReviewStatus(rev.id, 'Approved');
                            setReviewsList(prev => prev.map(r => r.id === rev.id ? { ...r, status: 'Approved' } : r));
                            setSaveToast({ type: 'success', msg: 'Review approved and published' });
                            setTimeout(() => setSaveToast(null), 3000);
                          }}
                        >
                          <FiCheck size={12} /> Approve
                        </button>
                      )}

                      {rev.status !== 'Rejected' && (
                        <button
                          type="button"
                          className="admin__ghost"
                          style={{ flex: 1, height: '30px', fontSize: '11.5px', color: '#DC2626' }}
                          onClick={async () => {
                            await adminApi.updateReviewStatus(rev.id, 'Rejected');
                            setReviewsList(prev => prev.map(r => r.id === rev.id ? { ...r, status: 'Rejected' } : r));
                            setSaveToast({ type: 'success', msg: 'Review rejected & hidden' });
                            setTimeout(() => setSaveToast(null), 3000);
                          }}
                        >
                          <FiX size={12} /> Reject
                        </button>
                      )}

                      <button
                        type="button"
                        className="admin-danger"
                        style={{ width: '30px', height: '30px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Delete Review"
                        onClick={async () => {
                          if (window.confirm('Delete this review permanently?')) {
                            await adminApi.deleteReview(rev.id);
                            setReviewsList(prev => prev.filter(r => r.id !== rev.id));
                          }
                        }}
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================================
             MODULE 2: GROCERY PROMOTIONS & COUPONS
             ========================================================================= */}
          {activeTab === 'offers' && (
            <div className="admin-promos-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                {/* Advanced Coupon Builder Form */}
                <form id="coupon-form" className="admin-form" onSubmit={saveCoupon}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiGift size={18} style={{ color: '#2D5016' }} />
                      <h2 style={{ margin: 0 }}>
                        {couponDraft.id ? `✏️ Edit Coupon: ${couponDraft.code}` : 'Create Coupon / Promotion'}
                      </h2>
                    </div>
                    {couponDraft.id && (
                      <button
                        type="button"
                        style={{
                          background: '#F3F4F6',
                          color: '#374151',
                          border: '1px solid #D1D5DB',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        onClick={() => setCouponDraft(blankCoupon)}
                      >
                        Cancel Editing
                      </button>
                    )}
                  </div>

                  <div className="admin-form__grid admin-form__grid--two">
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Coupon Code *</label>
                      <input value={couponDraft.code} onChange={(e) => setCouponDraft(prev => ({ ...prev, code: e.target.value }))} placeholder="e.g. WELCOME50, BOGO2026" required />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Promotion Type *</label>
                      <select value={couponDraft.type} onChange={(e) => setCouponDraft(prev => ({ ...prev, type: e.target.value }))}>
                        <option value="flat">Flat ₹ Discount</option>
                        <option value="percent">Percentage % Off</option>
                        <option value="bogo">BOGO (Buy 1 Get 1 Free)</option>
                        <option value="buyXgetY">Buy X Get Y Free</option>
                        <option value="freeDelivery">Free Delivery</option>
                      </select>
                    </div>
                  </div>

                  {/* BOGO & Buy X Get Y Quantities */}
                  {(couponDraft.type === 'bogo' || couponDraft.type === 'buyXgetY') && (
                    <div className="admin-form__grid admin-form__grid--two" style={{ background: '#FAF9F5', padding: '10px', borderRadius: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Buy Quantity (X)</label>
                        <input type="number" value={couponDraft.buyQuantity} onChange={(e) => setCouponDraft(prev => ({ ...prev, buyQuantity: e.target.value }))} placeholder="e.g. 2" />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Get Free Quantity (Y)</label>
                        <input type="number" value={couponDraft.getQuantity} onChange={(e) => setCouponDraft(prev => ({ ...prev, getQuantity: e.target.value }))} placeholder="e.g. 1" />
                      </div>
                    </div>
                  )}

                  {/* Discount values */}
                  {couponDraft.type !== 'freeDelivery' && couponDraft.type !== 'bogo' && couponDraft.type !== 'buyXgetY' && (
                    <div className="admin-form__grid admin-form__grid--two">
                      <div>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>
                          {couponDraft.type === 'percent' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}
                        </label>
                        <input value={couponDraft.value} onChange={(e) => setCouponDraft(prev => ({ ...prev, value: e.target.value }))} placeholder={couponDraft.type === 'percent' ? '15' : '50'} type="number" required />
                      </div>
                      {couponDraft.type === 'percent' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Max Discount Cap (₹)</label>
                          <input value={couponDraft.maxDiscount || ''} onChange={(e) => setCouponDraft(prev => ({ ...prev, maxDiscount: e.target.value }))} placeholder="e.g. 150 (optional)" type="number" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Target Scope */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Target Scope</label>
                    <select value={couponDraft.targetType} onChange={(e) => setCouponDraft(prev => ({ ...prev, targetType: e.target.value }))}>
                      <option value="all">Entire Store</option>
                      <option value="category">Specific Category</option>
                      <option value="product">Specific Product ID</option>
                      <option value="customer">Specific Customer Email</option>
                    </select>
                  </div>

                  {couponDraft.targetType === 'category' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Select Category</label>
                      <select value={couponDraft.targetCategory} onChange={(e) => setCouponDraft(prev => ({ ...prev, targetCategory: e.target.value }))}>
                        <option value="">Choose category...</option>
                        {dbCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {couponDraft.targetType === 'customer' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Target Customer Email</label>
                      <input value={couponDraft.targetCustomerEmail || ''} onChange={(e) => setCouponDraft(prev => ({ ...prev, targetCustomerEmail: e.target.value }))} placeholder="customer@gmail.com" />
                    </div>
                  )}

                  {/* Scheduling & Limits */}
                  <div className="admin-form__grid admin-form__grid--two">
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Start Date</label>
                      <input type="date" value={couponDraft.startDate || ''} onChange={(e) => setCouponDraft(prev => ({ ...prev, startDate: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: '700', marginBottom: '3px' }}>End Date (Expiry)</label>
                      <input type="date" value={couponDraft.endDate || ''} onChange={(e) => setCouponDraft(prev => ({ ...prev, endDate: e.target.value }))} />
                    </div>
                  </div>

                  <div className="admin-form__grid admin-form__grid--two">
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Total Store Usage Limit</label>
                      <input type="number" value={couponDraft.usageLimit} onChange={(e) => setCouponDraft(prev => ({ ...prev, usageLimit: e.target.value }))} placeholder="e.g. 500 (optional)" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Customer Limit (Per User)</label>
                      <input type="number" value={couponDraft.perUserLimit || 1} onChange={(e) => setCouponDraft(prev => ({ ...prev, perUserLimit: e.target.value }))} placeholder="1" min="1" />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Target Customer Type</label>
                    <select value={couponDraft.customerType} onChange={(e) => setCouponDraft(prev => ({ ...prev, customerType: e.target.value }))}>
                      <option value="retail">Retail Store</option>
                      <option value="wholesale">Wholesale B2B</option>
                      <option value="all">Both Retail & Wholesale</option>
                    </select>
                  </div>


                  <input value={couponDraft.title} onChange={(e) => setCouponDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="Coupon title e.g. FLAT ₹50 OFF" />
                  <input value={couponDraft.description} onChange={(e) => setCouponDraft(prev => ({ ...prev, description: e.target.value }))} placeholder="Coupon subtext e.g. On first grocery order" />

                  <button className="admin__primary">
                    {couponDraft.id ? <><FiSave /> Save Changes to Coupon</> : <><FiPlus /> Save & Activate Coupon</>}
                  </button>
                </form>

                {/* Coupon Engine Guidance Card */}
                <div className="admin-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <FiTag size={18} style={{ color: '#2D5016' }} />
                    <h2 style={{ margin: 0 }}>Coupon Engine Rules & Guidance</h2>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#4B5563', lineHeight: 1.6, margin: 0 }}>
                    Create custom promo codes and discounts for your customers here. Coupons are validated live at checkout.
                  </p>
                  <ul style={{ fontSize: '12px', color: '#687466', marginTop: '10px', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li><strong>Target Scope:</strong> Apply discounts storewide, or target specific categories, products, or customer emails.</li>
                    <li><strong>Per-User Limit:</strong> Restrict how many times an individual customer can redeem the code.</li>
                    <li><strong>Total Usage Limit:</strong> Set an optional total storewide redemption cap (e.g. first 500 customers).</li>
                    <li><strong>Target Customer Type:</strong> Restrict coupon use to Retail customers, Wholesale B2B customers, or both.</li>
                    <li><strong>Festive Offers:</strong> To add or manage seasonal festive deals, use <em>Product Catalog &rarr; Festive Offers</em>.</li>
                  </ul>
                </div>

              </div>

              {/* Active Coupons Grid with Usage Analytics */}
              <div className="admin-card admin-card--wide">
                <div className="admin-card__toolbar">
                  <h2>Active Coupons & Promo Codes ({coupons.length})</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                  {coupons.map(coupon => {
                    const isExpired = Boolean(coupon.endDate && new Date(coupon.endDate + 'T23:59:59') < new Date());
                    const expiryFormatted = coupon.endDate
                      ? new Date(coupon.endDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'No Expiry';
                    const usageText = coupon.usageLimit
                      ? `${coupon.timesUsed || 0} / ${coupon.usageLimit} times`
                      : `${coupon.timesUsed || 0} times`;
                    const perUserText = coupon.perUserLimit ? `${coupon.perUserLimit} use${coupon.perUserLimit > 1 ? 's' : ''}/user` : '1 use/user';

                    return (
                      <div key={coupon.id} className="admin-promo-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '15px', color: '#1C4D12', letterSpacing: '0.5px' }}>{coupon.code}</strong>
                          <span className={`admin-promo-pill admin-promo-pill--${coupon.type}`}>
                            {coupon.type === 'bogo' ? '🎁 BOGO'
                              : coupon.type === 'buyXgetY' ? `🎁 Buy ${coupon.buyQuantity} Get ${coupon.getQuantity}`
                              : coupon.type === 'freeDelivery' ? '🚚 FREE Delivery'
                              : coupon.type === 'percent' ? `${coupon.value}% OFF`
                              : `₹${coupon.value} OFF`}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: '12px', color: '#4B5563' }}>
                          {coupon.title || coupon.description || 'Promotional coupon'}
                        </p>

                        <div style={{ background: '#FAF9F5', padding: '10px 12px', borderRadius: '8px', fontSize: '11.5px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', border: '1px solid #F0EDE4' }}>
                          <span>Scope: <strong>{coupon.targetType || 'all'}</strong></span>
                          <span>Customer: <strong>{coupon.customerType === 'all' ? 'retail & wholesale' : (coupon.customerType || 'retail')}</strong></span>
                          <span>Used: <strong style={{ color: '#1C4D12' }}>{usageText}</strong></span>
                          <span>Discount Given: <strong style={{ color: '#166534' }}>₹{coupon.totalDiscountGiven || 0}</strong></span>
                          <span>User Limit: <strong>{perUserText}</strong></span>
                          <span>Expiry: <strong style={{ color: isExpired ? '#DC2626' : '#374151' }}>{expiryFormatted}</strong></span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                          <button
                            type="button"
                            style={{
                              background: isExpired ? '#FEE2E2' : (coupon.active !== false ? '#DCFCE7' : '#F3F4F6'),
                              color: isExpired ? '#991B1B' : (coupon.active !== false ? '#166534' : '#6B7280'),
                              border: isExpired ? '1px solid #FCA5A5' : 'none',
                              padding: '3px 10px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                            onClick={async () => {
                              const nextActive = coupon.active === false ? true : false;
                              try {
                                const updated = await adminApi.updateCoupon(coupon.id, { active: nextActive });
                                setCoupons(prev => prev.map(c => c.id === updated.id ? updated : c));
                                broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
                              } catch (err) { alert(err.message); }
                            }}
                          >
                            {isExpired ? '⏰ Expired' : (coupon.active !== false ? '🟢 Active' : '⚪ Inactive')}
                          </button>


                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            style={{
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              padding: '3px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={() => editCoupon(coupon)}
                            title="Edit coupon details"
                          >
                            <FiEdit2 size={12} /> Edit
                          </button>

                          <button
                            type="button"
                            className="admin-danger"
                            style={{ width: '28px', height: '28px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={async () => {
                              if (window.confirm(`Delete coupon code ${coupon.code}?`)) {
                                try {
                                  await adminApi.deleteCoupon(coupon.id);
                                  setCoupons(prev => prev.filter(c => c.id !== coupon.id));
                                  broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
                                  refreshSiteData();
                                  setSaveToast({ type: 'success', msg: `✅ Coupon ${coupon.code} deleted` });
                                  setTimeout(() => setSaveToast(null), 4000);
                                } catch (err) {
                                  alert(`Failed to delete coupon: ${err.message}`);
                                }
                              }
                            }}
                          >
                            <FiTrash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                </div>


              </div>
            </div>
          )}

          {/* =========================================================================
             MODULE 2B: FESTIVE OFFERS — dedicated view/manage page for the
             storefront's /festive-offers deals (a subset of the "offers" table
             filtered to group === 'festival'). Creating here always tags the
             deal festival, unlike the generic Promos & Coupons form above
             which only auto-detects it from festive keywords in the title.
             ========================================================================= */}
          {activeTab === 'festive-offers' && (
            <div className="admin-promos-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                <form className="admin-form" onSubmit={(e) => saveOffer(e, 'festival')}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiGift size={18} style={{ color: '#2D5016' }} />
                      <h2 style={{ margin: 0 }}>{offerDraft.id ? 'Edit Festive Offer' : 'Add Festive Offer'}</h2>
                    </div>
                    {offerDraft.id && (
                      <button type="button" className="admin__ghost" style={{ padding: '4px 10px', fontSize: '11.5px' }} onClick={() => setOfferDraft(blankOffer)}>
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  <input value={offerDraft.title} onChange={(e) => setOfferDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="Deal Title e.g. Diwali Mega Rice Fest" required />


                  {/* Multi-Product Combo Pack Builder */}
                  <div style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', border: '1.5px solid #86EFAC', borderRadius: '12px', padding: '14px', margin: '4px 0 10px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🎁 Build Festive Combo Pack (Multiple Products)
                      </strong>
                      <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 700, background: '#FFFFFF', padding: '2px 8px', borderRadius: '12px', border: '1px solid #86EFAC' }}>
                        {Array.isArray(offerDraft.comboItems) ? offerDraft.comboItems.length : 0} Products Selected
                      </span>
                    </div>

                    <p style={{ fontSize: '11.5px', color: '#166534', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                      Select multiple products from your catalog to build a festive combo package. Customers will see all included products on the offer page and get the entire bundle at your discounted deal price!
                    </p>

                    {/* Add Product Dropdown */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <select
                        id="combo-product-select"
                        className="admin-input-box"
                        style={{ flex: 1, background: '#FFFFFF' }}
                        onChange={(e) => {
                          if (e.target.value) {
                            addComboItemToOffer(e.target.value);
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">➕ Choose catalog product to add to combo...</option>
                        {dbProductsList.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.weight}{p.unit}) — MRP ₹{p.mrp || p.price} | Price ₹{p.price}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Add a one-off item that isn't in the catalog — its own name, price and image */}
                    <div style={{ background: '#FFFFFF', border: '1px dashed #86EFAC', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px' }}>
                      <strong style={{ fontSize: '11.5px', color: '#166534', display: 'block', marginBottom: '8px' }}>
                        ✨ Or add a custom item (not from your catalog)
                      </strong>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ProductImage
                            src={customComboDraft.image}
                            name={customComboDraft.name || 'Item'}
                            style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid #E1E6DC' }}
                          />
                          <label className="admin-file-input" style={{ fontSize: '11px' }}>
                            <span>{customComboImageUploading ? 'Uploading…' : (customComboDraft.image ? 'Change image' : 'Add image')}</span>
                            <input type="file" accept="image/*" onChange={handleCustomComboImageUpload} disabled={customComboImageUploading} />
                          </label>
                        </div>
                        <input
                          className="admin-input-box"
                          style={{ flex: '2 1 160px', minWidth: '140px' }}
                          value={customComboDraft.name}
                          onChange={(e) => setCustomComboDraft(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Item name e.g. Diwali Gift Box"
                        />
                        <input
                          className="admin-input-box"
                          style={{ flex: '1 1 90px', maxWidth: '110px' }}
                          type="number"
                          value={customComboDraft.price}
                          onChange={(e) => setCustomComboDraft(prev => ({ ...prev, price: e.target.value }))}
                          placeholder="Price ₹"
                        />
                        <input
                          className="admin-input-box"
                          style={{ flex: '1 1 90px', maxWidth: '110px' }}
                          type="number"
                          value={customComboDraft.mrp}
                          onChange={(e) => setCustomComboDraft(prev => ({ ...prev, mrp: e.target.value }))}
                          placeholder="MRP ₹ (optional)"
                        />
                        <button type="button" className="admin__ghost" onClick={addCustomComboItem} disabled={customComboImageUploading}>
                          <FiPlus /> Add
                        </button>
                      </div>
                    </div>

                    {/* List of Added Combo Items */}
                    {Array.isArray(offerDraft.comboItems) && offerDraft.comboItems.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {offerDraft.comboItems.map((item) => (
                          <div key={item.productId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <ProductImage src={item.image} name={item.name} style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '4px', flexShrink: 0 }} />
                              <div>
                                <strong style={{ fontSize: '12.5px', color: '#111827', display: 'block' }}>
                                  {item.name}
                                  {item.isCustom && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '1px 6px', borderRadius: '8px' }}>Custom</span>}
                                </strong>
                                <span style={{ fontSize: '11px', color: '#6B7280' }}>{item.weight ? `${item.weight} • ` : ''}MRP ₹{item.mrp || item.price} (Regular ₹{item.price})</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: '6px', padding: '2px 6px' }}>
                                <button type="button" style={{ border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer', padding: '0 4px' }} onClick={() => updateComboItemQty(item.productId, item.quantity - 1)}>-</button>
                                <span style={{ fontSize: '12px', fontWeight: 'bold', padding: '0 6px' }}>{item.quantity}</span>
                                <button type="button" style={{ border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer', padding: '0 4px' }} onClick={() => updateComboItemQty(item.productId, item.quantity + 1)}>+</button>
                              </div>
                              <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#166534', minWidth: '55px', textAlign: 'right' }}>₹{item.price * item.quantity}</span>
                              <button type="button" style={{ border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', padding: '2px' }} onClick={() => removeComboItemFromOffer(item.productId)} title="Remove item from combo">
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Combo Price Calculations Summary & Discount Input */}
                        <div style={{ background: '#FFFFFF', border: '1.5px dashed #86EFAC', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <div style={{ color: '#166534', fontWeight: 600, fontSize: '12px' }}>
                              Combo Total: <strong style={{ color: '#111827' }}>MRP ₹{offerDraft.comboItems.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0)}</strong>
                              <span style={{ margin: '0 6px', color: '#CBD5E1' }}>|</span>
                              Regular Price Sum: <strong style={{ color: '#111827' }}>₹{offerDraft.comboItems.reduce((sum, i) => sum + (i.price * i.quantity), 0)}</strong>
                            </div>
                            {Number(offerDraft.discountAmount) > 0 && (
                              <div style={{ color: '#15803D', fontSize: '11.5px', fontWeight: 700, marginTop: '2px' }}>
                                Final Deal Price: ₹{offerDraft.price} (Saving ₹{offerDraft.discountAmount})
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#166534', whiteSpace: 'nowrap' }}>
                              Discount Amount (₹):
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="e.g. 50"
                              className="admin-input-box"
                              style={{ width: '110px', padding: '5px 10px', background: '#F0FDF4', borderColor: '#86EFAC', fontSize: '13px', fontWeight: 700, color: '#166534' }}
                              value={offerDraft.discountAmount ?? ''}
                              onChange={(e) => {
                                const discVal = e.target.value;
                                const discNum = Math.max(0, Number(discVal) || 0);
                                const totalMrp = offerDraft.comboItems.reduce((sum, i) => sum + ((i.mrp || i.price) * i.quantity), 0);
                                const totalPrice = offerDraft.comboItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                                const basePrice = totalPrice || totalMrp;
                                const finalPrice = Math.max(0, basePrice - discNum);

                                setOfferDraft(prev => ({
                                  ...prev,
                                  discountAmount: discVal,
                                  price: discVal !== '' ? finalPrice : basePrice,
                                  mrp: totalMrp || prev.mrp,
                                  badge: discNum > 0 ? `SAVE ₹${discNum} ON COMBO` : (prev.badge || 'FESTIVE COMBO DEAL')
                                }));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Package Contents / Items Included *</label>
                    <input
                      value={offerDraft.itemsIncluded || ''}
                      onChange={(e) => setOfferDraft(prev => ({ ...prev, itemsIncluded: e.target.value }))}
                      placeholder="e.g. Includes: 5kg Basmati Rice + 1L Sunflower Oil"
                    />
                  </div>

                  <input value={offerDraft.subtitle} onChange={(e) => setOfferDraft(prev => ({ ...prev, subtitle: e.target.value }))} placeholder="Subtitle e.g. Flat 20% off on all Basmati Rice" />
                  <input value={offerDraft.badge} onChange={(e) => setOfferDraft(prev => ({ ...prev, badge: e.target.value }))} placeholder="Badge e.g. Save ₹80 / BOGO / Teachers Day Special" />


                  <div className="admin-form__grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Deal Price (₹) *</label>
                      <input
                        value={offerDraft.price}
                        onChange={(e) => {
                          const val = e.target.value;
                          const valNum = Number(val);
                          const comboReg = Array.isArray(offerDraft.comboItems) && offerDraft.comboItems.length > 0
                            ? offerDraft.comboItems.reduce((sum, i) => sum + (i.price * i.quantity), 0)
                            : Number(offerDraft.mrp || 0);
                          const computedDisc = (val !== '' && !isNaN(valNum) && comboReg > valNum) ? comboReg - valNum : '';
                          setOfferDraft(prev => ({
                            ...prev,
                            price: val,
                            discountAmount: computedDisc !== '' ? computedDisc : prev.discountAmount
                          }));
                        }}
                        placeholder="Deal Price (₹)"
                        type="number"
                        min="0"
                        max="9999999"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Discount Amount (₹)</label>
                      <input
                        value={offerDraft.discountAmount ?? ''}
                        onChange={(e) => {
                          const discVal = e.target.value;
                          const discNum = Math.max(0, Number(discVal) || 0);
                          const comboReg = Array.isArray(offerDraft.comboItems) && offerDraft.comboItems.length > 0
                            ? offerDraft.comboItems.reduce((sum, i) => sum + (i.price * i.quantity), 0)
                            : Number(offerDraft.mrp || 0);
                          const finalPrice = Math.max(0, comboReg - discNum);
                          setOfferDraft(prev => ({
                            ...prev,
                            discountAmount: discVal,
                            price: discVal !== '' ? finalPrice : (prev.price || comboReg),
                            badge: discNum > 0 ? `SAVE ₹${discNum} ON COMBO` : prev.badge
                          }));
                        }}
                        placeholder="e.g. 50"
                        type="number"
                        min="0"
                        max="9999999"
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '3px' }}>Total MRP (₹)</label>
                      <input
                        value={offerDraft.mrp}
                        onChange={(e) => setOfferDraft(prev => ({ ...prev, mrp: e.target.value }))}
                        placeholder="MRP (₹)"
                        type="number"
                        min="0"
                        max="9999999"
                      />
                    </div>
                  </div>

                  <div className="admin-offer-image">
                    {offerDraft.image ? (
                      <img src={toWebpImage(offerDraft.image)} alt="Offer preview" />
                    ) : (
                      <div className="admin-offer-image__empty"><FiGift /></div>
                    )}
                    <div>
                      <input value={offerDraft.image} onChange={(e) => setOfferDraft(prev => ({ ...prev, image: e.target.value }))} placeholder="Add offer image URL" />
                      <label className="admin-file-input admin-file-input--compact">
                        <span>Or choose file from device</span>
                        <input type="file" accept="image/*" onChange={handleOfferImageUpload} />
                      </label>
                    </div>
                  </div>

                  <button className="admin__primary" disabled={imageUploading}>
                    {imageUploading ? 'Uploading image...' : <><FiPlus /> {offerDraft.id ? 'Update Festive Offer' : 'Publish Festive Offer'}</>}
                  </button>
                </form>

                <div className="admin-card">
                  <h2>About this page</h2>
                  <p style={{ fontSize: '12.5px', color: '#687466', lineHeight: 1.6 }}>
                    Deals published here appear on the storefront's <strong>Festive Offers</strong> page
                    (linked from the home screen). Toggle a deal off or delete it any time — changes
                    go live immediately.
                  </p>
                </div>
              </div>

              <div className="admin-card admin-card--wide">
                <div className="admin-card__toolbar">
                  <h2>Festive Offers ({offers.filter(o => o.group === 'festival').length})</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                  {offers.filter(o => o.group === 'festival').map(offer => (
                    <div key={offer.id} className="admin-promo-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '15px', color: '#1C4D12' }}>{offer.title}</strong>
                        {offer.badge && (
                          <span className="admin-promo-pill">{offer.badge}</span>
                        )}
                      </div>

                      <p style={{ margin: 0, fontSize: '12px', color: '#4B5563' }}>
                        {offer.subtitle || 'Festive promotion'}
                      </p>

                      <div style={{ background: '#FAF9F5', padding: '8px 10px', borderRadius: '8px', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span>Price: <strong>{formatPrice(offer.price)}</strong>{offer.mrp > offer.price && <> (MRP {formatPrice(offer.mrp)})</>}</span>
                        {(offer.itemsIncluded || offer.subtitle) && (
                          <span style={{ color: '#166534', fontWeight: 600 }}>📦 Included: <strong>{offer.itemsIncluded || offer.subtitle}</strong></span>
                        )}
                      </div>


                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <button
                          type="button"
                          style={{
                            background: offer.active !== false ? '#DCFCE7' : '#F3F4F6',
                            color: offer.active !== false ? '#166534' : '#6B7280',
                            border: 'none',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                          onClick={async () => {
                            const nextActive = offer.active === false ? true : false;
                            try {
                              const updated = normalizeOffer(await adminApi.updateOffer(offer.id, { active: nextActive }));
                              setOffers(prev => prev.map(o => o.id === updated.id ? updated : o));
                              broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
                            } catch (err) { alert(err.message); }
                          }}
                        >
                          {offer.active !== false ? '🟢 Active' : '⚪ Inactive'}
                        </button>

                        <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="admin__ghost"
                          style={{ width: '28px', height: '28px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => editFestiveOffer(offer)}
                        >
                          <FiEdit2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="admin-danger"
                          style={{ width: '28px', height: '28px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={async () => {
                            if (window.confirm(`Delete festive offer "${offer.title}"?`)) {
                              await adminApi.deleteOffer(offer.id);
                              setOffers(prev => prev.filter(o => o.id !== offer.id));
                              broadcastSync(SYNC_EVENTS.SITE_DATA_CHANGED);
                            }
                          }}
                        >
                          <FiTrash2 size={12} />
                        </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {offers.filter(o => o.group === 'festival').length === 0 && (
                  <p style={{ fontSize: '12.5px', color: '#687466', padding: '8px 4px' }}>
                    No festive offers yet — add one using the form above.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
             MODULE 3: GROCERY SALES & INVENTORY ANALYTICS
             ========================================================================= */}
          {activeTab === 'sales-stats' && (
            <div className="sales-analytics-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Header & Range Bar */}
              <div className="admin-card admin-card--wide" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Grocery Sales & Inventory Analytics</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#687466' }}>
                      Real-time revenue, margins, wastage, turnover, and delivery area analytics.
                    </p>
                  </div>

                  <div className="admin-analytics-range-bar">
                    <button
                      type="button"
                      className={`admin-range-btn ${analyticsTimeRange === '1' ? 'admin-range-btn--active' : ''}`}
                      onClick={() => setAnalyticsTimeRange('1')}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`admin-range-btn ${analyticsTimeRange === '7' ? 'admin-range-btn--active' : ''}`}
                      onClick={() => setAnalyticsTimeRange('7')}
                    >
                      7 Days
                    </button>
                    <button
                      type="button"
                      className={`admin-range-btn ${analyticsTimeRange === '30' ? 'admin-range-btn--active' : ''}`}
                      onClick={() => setAnalyticsTimeRange('30')}
                    >
                      30 Days
                    </button>
                    <button
                      type="button"
                      className={`admin-range-btn ${analyticsTimeRange === '90' ? 'admin-range-btn--active' : ''}`}
                      onClick={() => setAnalyticsTimeRange('90')}
                    >
                      90 Days
                    </button>
                    <button
                      type="button"
                      className={`admin-range-btn ${analyticsTimeRange === '365' ? 'admin-range-btn--active' : ''}`}
                      onClick={() => setAnalyticsTimeRange('365')}
                    >
                      1 Year
                    </button>
                  </div>
                </div>
              </div>

              {/* 4-KPI Grid */}
              <div className="admin-analytics-grid-4">
                <div className="sales-kpi-card">
                  <span>GROSS REVENUE</span>
                  <strong>{formatPrice(analyticsSummary.grossRevenue)}</strong>
                  <small>Net: {formatPrice(analyticsSummary.netRevenue)} (after {formatPrice(analyticsSummary.totalRefunds)} refunds)</small>
                </div>

                <div className="sales-kpi-card">
                  <span>ORDERS & UNITS</span>
                  <strong>{analyticsSummary.ordersCount} orders</strong>
                  <small>{analyticsSummary.totalUnitsSold} grocery units delivered</small>
                </div>

                <div className="sales-kpi-card">
                  <span>AVG ORDER VALUE (AOV)</span>
                  <strong>{formatPrice(analyticsSummary.aov)}</strong>
                  <small>Repeat Customer Rate: <strong>{analyticsSummary.repeatRate}%</strong></small>
                </div>

                <div className="sales-kpi-card" style={{ background: '#FFFDF7', borderColor: '#FDE68A' }}>
                  <span style={{ color: '#92400E' }}>WASTAGE / EXPIRED LOSSES</span>
                  <strong style={{ color: '#B45309' }}>{formatPrice(analyticsSummary.wastageLoss)}</strong>
                  <small>Damaged + Expired stock valuation</small>
                </div>
              </div>

              {/* Revenue Trend SVG Chart */}
              <section className="sales-chart-card">
                <div className="sales-section-label">REVENUE TREND ({analyticsTimeRange} DAYS)</div>
                <div className="sales-line-chart-wrap">
                  {(() => {
                    const maxRevenue = Math.max(...salesTrendData.map(item => item.revenue), 1);
                    const chartWidth = 1000;
                    const chartHeight = 280;
                    const left = 52;
                    const right = 12;
                    const top = 18;
                    const bottom = 38;
                    const innerWidth = chartWidth - left - right;
                    const innerHeight = chartHeight - top - bottom;
                    const points = salesTrendData.map((item, index) => {
                      const x = left + (index / (Math.max(salesTrendData.length - 1, 1))) * innerWidth;
                      const y = top + innerHeight - (item.revenue / maxRevenue) * innerHeight;
                      return { ...item, x, y };
                    });
                    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
                    const areaPath = `${linePath} L ${points[points.length - 1].x} ${top + innerHeight} L ${points[0].x} ${top + innerHeight} Z`;
                    return (
                      <svg className="sales-line-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                          const y = top + innerHeight - tick * innerHeight;
                          return (
                            <g key={tick}>
                              <line x1={left} x2={chartWidth - right} y1={y} y2={y} className="sales-chart-grid" />
                              <text x={left - 12} y={y + 4} textAnchor="end" className="sales-chart-axis">{formatPrice(maxRevenue * tick)}</text>
                            </g>
                          );
                        })}
                        <path d={areaPath} className="sales-chart-area" />
                        <path d={linePath} className="sales-chart-line" />
                      </svg>
                    );
                  })()}
                </div>
              </section>

              {/* Category & Brand Performance Breakdown Cards */}
              <div className="admin-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="admin-breakdown-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '13.5px', color: '#1C4B12' }}>Category Revenue Share</strong>
                    <FiPieChart size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analyticsSummary.categorySales.slice(0, 6).map(([cat, rev]) => {
                      const maxCat = analyticsSummary.categorySales[0]?.[1] || 1;
                      const pct = Math.round((rev / (analyticsSummary.grossRevenue || 1)) * 100);
                      return (
                        <div key={cat} className="admin-breakdown-item">
                          <span style={{ textTransform: 'capitalize', fontWeight: 600, width: '100px' }}>{cat}</span>
                          <div className="admin-progress-bar-wrap">
                            <div className="admin-progress-bar-fill" style={{ width: `${(rev / maxCat) * 100}%` }} />
                          </div>
                          <strong>{formatPrice(rev)} ({pct}%)</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-breakdown-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '13.5px', color: '#1C4B12' }}>Brand Performance Share</strong>
                    <FiTag size={16} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analyticsSummary.brandSales.slice(0, 6).map(([brand, rev]) => {
                      const maxBrand = analyticsSummary.brandSales[0]?.[1] || 1;
                      const pct = Math.round((rev / (analyticsSummary.grossRevenue || 1)) * 100);
                      return (
                        <div key={brand} className="admin-breakdown-item">
                          <span style={{ fontWeight: 600, width: '100px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brand}</span>
                          <div className="admin-progress-bar-wrap">
                            <div className="admin-progress-bar-fill" style={{ width: `${(rev / maxBrand) * 100}%`, background: '#3B82F6' }} />
                          </div>
                          <strong>{formatPrice(rev)} ({pct}%)</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Fast-Moving vs Slow-Moving Products */}
              <div className="admin-grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
                <div className="admin-card">
                  <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#1C4B12', margin: '0 0 10px' }}>
                    🚀 Fast-Moving Products (Top Sellers)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analyticsSummary.fastMoving.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FAF9F5', borderRadius: '8px', fontSize: '12px' }}>
                        <div>
                          <strong>{idx + 1}. {p.name}</strong>
                          <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>{p.brand} · {p.category}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ color: '#15803D' }}>{formatPrice(p.revenue)}</strong>
                          <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>{p.units} units sold</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-card">
                  <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#B45309', margin: '0 0 10px' }}>
                    ⏳ Slow-Moving / Low Turnover Watchlist
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analyticsSummary.slowMoving.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FFFDF7', border: '1px solid #FEF3C7', borderRadius: '8px', fontSize: '12px' }}>
                        <div>
                          <strong>{p.name}</strong>
                          <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>Stock: {p.stockNote}</span>
                        </div>
                        <button
                          type="button"
                          className="admin__ghost"
                          style={{ height: '28px', fontSize: '11px' }}
                          onClick={() => {
                            setActiveTab('offers');
                            setCouponDraft(prev => ({
                              ...prev,
                              code: `DEAL-${p.category.toUpperCase()}`,
                              title: `Special Promo on ${p.name}`,
                              targetType: 'product',
                              targetProductId: p.id
                            }));
                          }}
                        >
                          + Create Promo
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Delivery Area & Pincode Performance Table */}
              <div className="admin-card admin-card--wide">
                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#1C4B12', margin: '0 0 10px' }}>
                  🚚 Locality & Delivery Area Performance
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>LOCALITY / AREA</th>
                        <th>ORDERS FULFILLED</th>
                        <th>REVENUE (₹)</th>
                        <th>AVG ORDER VALUE (₹)</th>
                        <th>SHARE (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsSummary.areaSales.map(([area, data]) => {
                        const pct = Math.round((data.revenue / (analyticsSummary.grossRevenue || 1)) * 100);
                        return (
                          <tr key={area}>
                            <td><strong>{area}</strong></td>
                            <td>{data.orders}</td>
                            <td><strong style={{ color: '#15803D' }}>{formatPrice(data.revenue)}</strong></td>
                            <td>{formatPrice(Math.round(data.revenue / (data.orders || 1)))}</td>
                            <td>
                              <span className="admin-dist-bar-fill" style={{ display: 'inline-block', width: `${Math.max(10, pct)}%`, padding: '2px 6px', color: '#fff', fontSize: '10.5px', borderRadius: '4px', textAlign: 'center' }}>
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
             OTHER MODULES: ORDERS, CUSTOMERS, INVENTORY, DELIVERY, CATALOG
             ========================================================================= */}
          {activeTab === 'orders' && (
            <div className="admin-orders-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Top Filter and Search Toolbar */}
              <div className="admin-card admin-card--wide" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="inventory-filters-tabs">
                    <button
                      className={`inventory-filter-btn ${orderStatusFilter === 'all' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setOrderStatusFilter('all')}
                    >
                      All Orders <span className="inventory-badge-count">{liveOrders?.length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${orderStatusFilter === 'preparing' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setOrderStatusFilter('preparing')}
                    >
                      📦 Preparing (Confirmed) <span className="inventory-badge-count">{liveOrders?.filter(o => o.status === 'Preparing').length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${orderStatusFilter === 'delivered' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setOrderStatusFilter('delivered')}
                    >
                      ✅ Delivered <span className="inventory-badge-count">{liveOrders?.filter(o => o.status === 'Delivered').length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${orderStatusFilter === 'cancelled' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setOrderStatusFilter('cancelled')}
                    >
                      ❌ Cancelled <span className="inventory-badge-count">{liveOrders?.filter(o => o.status === 'Cancelled').length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${orderStatusFilter === 'returns' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setOrderStatusFilter('returns')}
                    >
                      ↩️ Returns <span className="inventory-badge-count">{liveOrders?.filter(o => o.returnStatus && o.returnStatus !== 'None').length || 0}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px' }}>
                      <div className="admin-search-label" style={{ flex: 1 }}>
                        <FiSearch />
                        <input
                          placeholder="Search by Order ID, Bill No, Customer Name, Phone, Address or Txn Ref..."
                          value={orderSearchQuery}
                          onChange={(e) => setOrderSearchQuery(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <select
                        className="admin-input-box"
                        style={{ width: '170px', height: '38px', borderRadius: '10px' }}
                        value={orderPaymentFilter}
                        onChange={(e) => setOrderPaymentFilter(e.target.value)}
                      >
                        <option value="all">All Payments</option>
                        <option value="paid">🟢 Paid</option>
                        <option value="unpaid">🔴 Unpaid</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="admin__ghost" onClick={loadOrders} style={{ height: '38px', padding: '0 12px', fontSize: '12px' }}>
                        <FiRefreshCw size={13} /> Refresh
                      </button>
                      <button className="admin__primary" onClick={exportOrdersCsv} style={{ height: '38px', padding: '0 14px', fontSize: '12px' }}>
                        📥 Export Orders CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredOrders.length === 0 ? (
                  <div className="admin-card admin-card--wide" style={{ textAlign: 'center', padding: '40px', color: '#687466' }}>
                    No orders matching your filter or search criteria.
                  </div>
                ) : filteredOrders.map(order => (
                  <div key={order.id} className="admin-order-card-enhanced">
                    <div className="admin-order-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#F1F8E9', color: '#2D5016', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FiShoppingBag size={18} />
                        </div>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#111827' }}>Order #{order.id}</strong>
                          <span style={{ fontSize: '12px', color: '#2D5016', fontWeight: '800', marginLeft: '8px' }}>BILL-{order.id + 7820}</span>
                          <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>
                            Placed on: {order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : '—'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className={`admin-order-status-pill admin-order-status-pill--${(order.status || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                          {order.status}
                        </span>
                        <span className={`admin-payment-pill admin-payment-pill--${(order.paymentStatus || 'unpaid').toLowerCase().replace(/\s+/g, '-')}`}>
                          {order.paymentStatus === 'Paid' ? '✓ Paid' : (order.paymentStatus === 'Refunded' ? '🟣 Refunded' : '🔴 Unpaid')}
                        </span>
                        {order.deliverySlot && (
                          <span style={{ fontSize: '11px', background: '#FAF9F5', border: '1px solid #E1E6DC', padding: '2px 7px', borderRadius: '4px', color: '#4B5563' }}>
                            🕒 {order.deliverySlot}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          className="admin__ghost"
                          style={{ height: '32px', fontSize: '11.5px', padding: '0 10px', borderRadius: '6px' }}
                          onClick={() => {
                            setSelectedOrderModal(order);
                            setOrderNotesText(order.orderNotes || '');
                            setRefundForm({ amount: '', reason: 'Customer return / out of stock' });
                          }}
                        >
                          <FiEye size={12} /> View Details
                        </button>
                        <button
                          className="admin__ghost"
                          style={{ height: '32px', fontSize: '11.5px', padding: '0 10px', borderRadius: '6px' }}
                          title="Print Tax Invoice"
                          onClick={() => setInvoiceModalOrder(order)}
                        >
                          <FiPrinter size={12} /> Invoice
                        </button>
                      </div>
                    </div>

                    <div className="admin-order-body-grid">
                      <div>
                        <span style={{ fontSize: '11px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Customer</span>
                        <strong style={{ display: 'block', fontSize: '13px', color: '#111827', marginTop: '2px' }}>
                          {order.customerName || 'Customer'}
                        </strong>
                        {order.customerPhone && <span style={{ fontSize: '11.5px', color: '#4B5563', display: 'block' }}>📞 {order.customerPhone}</span>}
                        {order.customerEmail && <span style={{ fontSize: '11.5px', color: '#4B5563', display: 'block' }}>✉️ {order.customerEmail}</span>}
                      </div>

                      <div>
                        <span style={{ fontSize: '11px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Items ({order.items?.length || 0})</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                          {(order.items || []).slice(0, 3).map((item, idx) => (
                            <span key={idx} style={{ fontSize: '11.5px', color: '#374151' }}>
                              • {item.name} {item.weight ? `(${item.weight}${item.unit})` : ''} <strong>x{item.quantity || 1}</strong>
                            </span>
                          ))}
                          {(order.items || []).length > 3 && (
                            <span style={{ fontSize: '11px', color: '#687466' }}>+{(order.items || []).length - 3} more item(s)...</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '11px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Delivery Details</span>
                        <span style={{ display: 'block', fontSize: '11.5px', color: '#374151', marginTop: '2px', lineHeight: '1.3' }}>
                          {order.deliveryAddress || 'Store Pickup'}
                        </span>
                        {order.trackingNumber && (
                          <span style={{ fontSize: '10.5px', color: '#687466', display: 'block', marginTop: '2px' }}>
                            Tracking: <strong>{order.trackingNumber}</strong>
                          </span>
                        )}
                      </div>

                      <div>
                        <span style={{ fontSize: '11px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Payment & Txn</span>
                        <strong style={{ display: 'block', fontSize: '12.5px', color: '#111827', marginTop: '2px' }}>
                          {order.paymentGateway || order.paymentMethod || 'COD'}
                        </strong>
                        <span style={{ fontSize: '11px', color: '#687466', fontFamily: 'monospace', display: 'block' }}>
                          {order.paymentTxnId || `TXN-SIRI-${order.id}`}
                        </span>
                        {order.refundAmount > 0 && (
                          <span style={{ fontSize: '11px', color: '#7E22CE', fontWeight: 'bold', display: 'block' }}>
                            Refunded: {formatPrice(order.refundAmount)}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Grand Total: </span>
                          <strong style={{ fontSize: '15px', color: '#111827' }}>
                            {formatPrice(order.total)}
                          </strong>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#687466', textTransform: 'uppercase', marginBottom: '2px' }}>Order Status</span>
                            <select
                              value={order.status}
                              className="admin-status-select"
                              style={{ height: '30px', fontSize: '11.5px', borderRadius: '6px' }}
                              onChange={(e) => {
                                const newStatus = e.target.value;
                                let payload = { status: newStatus };
                                if (newStatus === 'Delivered' && order.paymentStatus !== 'Paid') {
                                  payload.paymentStatus = 'Paid';
                                } else if (order.status === 'Delivered' && (newStatus === 'Preparing' || newStatus === 'Cancelled')) {
                                  payload.paymentStatus = 'Unpaid';
                                }
                                handleUpdateOrder(order.id, payload);
                              }}
                            >
                              <option value="Preparing">Preparing (Confirmed)</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Returned">Item Returned to Warehouse</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#687466', textTransform: 'uppercase', marginBottom: '2px' }}>Payment Status</span>
                            <select
                              value={['Paid', 'Unpaid', 'Refunded', 'Partially Refunded'].includes(order.paymentStatus) ? order.paymentStatus : 'Unpaid'}
                              className="admin-status-select"
                              style={{
                                height: '30px',
                                fontSize: '11.5px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                borderColor: order.paymentStatus === 'Paid' ? '#86EFAC' : (order.paymentStatus === 'Refunded' || order.paymentStatus === 'Partially Refunded' ? '#D8B4FE' : '#FCA5A5'),
                                background: order.paymentStatus === 'Paid' ? '#F0FDF4' : (order.paymentStatus === 'Refunded' || order.paymentStatus === 'Partially Refunded' ? '#FAF5FF' : '#FEF2F2'),
                                color: order.paymentStatus === 'Paid' ? '#166534' : (order.paymentStatus === 'Refunded' || order.paymentStatus === 'Partially Refunded' ? '#6B21A8' : '#991B1B')
                              }}
                              onChange={(e) => {
                                const newPayment = e.target.value;
                                handleUpdateOrder(order.id, { paymentStatus: newPayment }, `Payment status updated to ${newPayment}`);
                              }}
                            >
                              <option value="Paid">🟢 Paid</option>
                              <option value="Unpaid">🔴 Unpaid</option>
                              <option value="Refunded">🟣 Refunded</option>
                              <option value="Partially Refunded">🟣 Partially Refunded</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* MODAL: DETAILED ORDER DRILLDOWN & PAYMENT ACTIONS */}
              {selectedOrderModal && (
                <div className="inventory-modal-backdrop" onClick={() => setSelectedOrderModal(null)}>
                  <div className="inventory-modal" style={{ maxWidth: '780px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <div>
                        <h2>Order #{selectedOrderModal.id} — BILL-{selectedOrderModal.id + 7820}</h2>
                        <span style={{ fontSize: '11.5px', color: '#687466' }}>
                          Placed on: {selectedOrderModal.createdAt ? new Date(selectedOrderModal.createdAt).toLocaleString('en-IN') : '—'}
                        </span>
                      </div>
                      <button className="inventory-modal__close" onClick={() => setSelectedOrderModal(null)}>✕</button>
                    </div>

                    <div className="inventory-modal__body" style={{ gap: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', background: '#FAF9F5', padding: '14px', borderRadius: '10px' }}>
                        <div>
                          <strong style={{ display: 'block', fontSize: '13px', color: '#1C4B12', marginBottom: '4px' }}>Customer Contact</strong>
                          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                            <div>Name: <strong>{selectedOrderModal.customerName || 'Customer'}</strong></div>
                            <div>Phone: <strong>{selectedOrderModal.customerPhone || 'Not provided'}</strong></div>
                            <div>Email: <strong>{selectedOrderModal.customerEmail || 'Not provided'}</strong></div>
                          </div>
                        </div>
                        <div>
                          <strong style={{ display: 'block', fontSize: '13px', color: '#1C4B12', marginBottom: '4px' }}>Delivery Details</strong>
                          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                            <div>Address: <strong>{selectedOrderModal.deliveryAddress || 'Store Pickup'}</strong></div>
                            <div>Slot: <strong>{selectedOrderModal.deliverySlot || 'Standard Delivery'}</strong></div>
                            <div>Tracking: <strong>{selectedOrderModal.trackingNumber || 'TRK-SIRI-DEFAULT'}</strong></div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 style={{ fontSize: '12.5px', textTransform: 'uppercase', color: '#1C4B12', margin: '0 0 8px', fontWeight: 800 }}>
                          Order Items ({(selectedOrderModal.items || []).length})
                        </h3>
                        <table className="admin-variant-table">
                          <thead>
                            <tr>
                              <th>PRODUCT</th>
                              <th>PACK SIZE</th>
                              <th>PRICE (₹)</th>
                              <th>QTY</th>
                              <th style={{ textAlign: 'right' }}>TOTAL (₹)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedOrderModal.items || []).map((it, i) => (
                              <tr key={i}>
                                <td><strong>{it.name}</strong></td>
                                <td>{it.weight ? `${it.weight}${it.unit}` : 'Standard'}</td>
                                <td>{formatPrice(it.price)}</td>
                                <td>x{it.quantity || 1}</td>
                                <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatPrice(it.price * (it.quantity || 1))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '10px', padding: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <strong style={{ fontSize: '13px', color: '#111827' }}>Payment & Transaction Record</strong>
                          <span className={`admin-payment-pill admin-payment-pill--${(selectedOrderModal.paymentStatus || 'unpaid').toLowerCase().replace(/\s+/g, '-')}`}>
                            {selectedOrderModal.paymentStatus === 'Paid' ? '✓ Paid' : (selectedOrderModal.paymentStatus === 'Refunded' ? '🟣 Refunded' : '🔴 Unpaid')}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '12px' }}>
                          <div>Method: <strong>{selectedOrderModal.paymentGateway || selectedOrderModal.paymentMethod || 'COD'}</strong></div>
                          <div>Txn Ref: <strong style={{ fontFamily: 'monospace' }}>{selectedOrderModal.paymentTxnId || `TXN-SIRI-${selectedOrderModal.id}`}</strong></div>
                          <div>Total Billed: <strong>{formatPrice(selectedOrderModal.total)}</strong></div>
                          <div>Refunded: <strong style={{ color: '#7E22CE' }}>{formatPrice(selectedOrderModal.refundAmount || 0)}</strong></div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#687466' }}>Order Status:</span>
                            <select
                              value={selectedOrderModal.status}
                              className="admin-status-select"
                              style={{ height: '32px', fontSize: '12px', borderRadius: '6px' }}
                              onChange={(e) => {
                                const newStatus = e.target.value;
                                let payload = { status: newStatus };
                                if (newStatus === 'Delivered' && selectedOrderModal.paymentStatus !== 'Paid') {
                                  payload.paymentStatus = 'Paid';
                                } else if (selectedOrderModal.status === 'Delivered' && (newStatus === 'Preparing' || newStatus === 'Cancelled')) {
                                  payload.paymentStatus = 'Unpaid';
                                }
                                handleUpdateOrder(selectedOrderModal.id, payload);
                              }}
                            >
                              <option value="Preparing">Preparing (Order Confirmed)</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Returned">Item Returned to Warehouse</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#687466' }}>Payment Status:</span>
                            <select
                              value={['Paid', 'Unpaid', 'Refunded', 'Partially Refunded'].includes(selectedOrderModal.paymentStatus) ? selectedOrderModal.paymentStatus : 'Unpaid'}
                              className="admin-status-select"
                              style={{
                                height: '32px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                borderColor: selectedOrderModal.paymentStatus === 'Paid' ? '#86EFAC' : (selectedOrderModal.paymentStatus === 'Refunded' || selectedOrderModal.paymentStatus === 'Partially Refunded' ? '#D8B4FE' : '#FCA5A5'),
                                background: selectedOrderModal.paymentStatus === 'Paid' ? '#F0FDF4' : (selectedOrderModal.paymentStatus === 'Refunded' || selectedOrderModal.paymentStatus === 'Partially Refunded' ? '#FAF5FF' : '#FEF2F2'),
                                color: selectedOrderModal.paymentStatus === 'Paid' ? '#166534' : (selectedOrderModal.paymentStatus === 'Refunded' || selectedOrderModal.paymentStatus === 'Partially Refunded' ? '#6B21A8' : '#991B1B')
                              }}
                              onChange={(e) => {
                                const newPayment = e.target.value;
                                handleUpdateOrder(selectedOrderModal.id, { paymentStatus: newPayment }, `Payment status updated to ${newPayment}`);
                              }}
                            >
                              <option value="Paid">🟢 Paid</option>
                              <option value="Refunded">🟣 Refunded</option>
                              <option value="Partially Refunded">🟣 Partially Refunded</option>
                              <option value="Unpaid">🔴 Unpaid</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '10px', padding: '14px' }}>
                        <strong style={{ display: 'block', fontSize: '12.5px', color: '#6B21A8', marginBottom: '8px' }}>
                          💸 Issue Refund / Partial Refund
                        </strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '8px' }}>
                          <input
                            type="number"
                            className="admin-input-box"
                            placeholder="Amount (₹)"
                            value={refundForm.amount}
                            onChange={(e) => setRefundForm(p => ({ ...p, amount: e.target.value }))}
                          />
                          <input
                            type="text"
                            className="admin-input-box"
                            placeholder="Reason for refund (e.g. Item out of stock)"
                            value={refundForm.reason}
                            onChange={(e) => setRefundForm(p => ({ ...p, reason: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="admin__primary"
                            style={{ height: '38px', background: '#7E22CE', padding: '0 14px', fontSize: '12px' }}
                            disabled={!refundForm.amount || Number(refundForm.amount) <= 0 || orderActionLoading}
                            onClick={() => {
                              handleUpdateOrder(
                                selectedOrderModal.id,
                                { refundAmount: Number(refundForm.amount), refundReason: refundForm.reason },
                                `Issued refund of ₹${refundForm.amount}`
                              );
                              setRefundForm({ amount: '', reason: 'Customer return / out of stock' });
                            }}
                          >
                            Process Refund
                          </button>
                        </div>
                      </div>

                      {selectedOrderModal.status !== 'Cancelled' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px' }}>
                          <div>
                            <strong style={{ display: 'block', fontSize: '12.5px', color: '#991B1B' }}>Cancel Order & Restock</strong>
                            <span style={{ fontSize: '11px', color: '#7F1D1D' }}>Cancel order and automatically restore stock in inventory database.</span>
                          </div>
                          <button
                            type="button"
                            className="admin-danger"
                            style={{ height: '32px', padding: '0 12px', fontSize: '11.5px', borderRadius: '6px' }}
                            onClick={() => {
                              if (window.confirm('Cancel order and restock items back into inventory?')) {
                                const payload = selectedOrderModal.status === 'Delivered'
                                  ? { status: 'Cancelled', paymentStatus: 'Unpaid', cancellationReason: 'Admin / Customer cancellation', restockOnCancel: true }
                                  : { status: 'Cancelled', cancellationReason: 'Admin / Customer cancellation', restockOnCancel: true };
                                handleUpdateOrder(
                                  selectedOrderModal.id,
                                  payload,
                                  `Order #${selectedOrderModal.id} cancelled and inventory restocked`
                                );
                              }
                            }}
                          >
                            Cancel & Restock
                          </button>
                        </div>
                      )}

                      <div>
                        <strong style={{ display: 'block', fontSize: '12px', color: '#111827', marginBottom: '4px' }}>Internal Order Notes & Instructions</strong>
                        <textarea
                          rows={2}
                          className="admin-input-box"
                          placeholder="Add driver delivery instructions, customer phone verification notes..."
                          value={orderNotesText}
                          onChange={(e) => setOrderNotesText(e.target.value)}
                        />
                        <button
                          type="button"
                          className="admin__ghost"
                          style={{ marginTop: '6px', height: '30px', fontSize: '11.5px' }}
                          onClick={() => handleUpdateOrder(selectedOrderModal.id, { orderNotes: orderNotesText }, 'Order notes saved')}
                        >
                          Save Notes
                        </button>
                      </div>
                    </div>

                    <div className="inventory-modal__footer">
                      <button className="admin__ghost" onClick={() => setSelectedOrderModal(null)}>Close</button>
                      <button className="admin__primary" onClick={() => { setInvoiceModalOrder(selectedOrderModal); setSelectedOrderModal(null); }}>
                        <FiPrinter /> Print Tax Invoice
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL: TAX INVOICE GENERATOR & PRINT VIEW */}
              {invoiceModalOrder && createPortal(
                <div className="inventory-modal-backdrop" onClick={() => setInvoiceModalOrder(null)}>
                  <div className="admin-invoice-modal" onClick={e => e.stopPropagation()}>
                    <div className="admin-invoice-paper">
                      <div className="admin-invoice-header">
                        <div>
                          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#1C4B12', letterSpacing: '0.5px' }}>
                            SIRI TRADERS
                          </h1>
                          <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#4B5563' }}>
                            Premium Grocery & Wholesale Merchant<br />
                            Hyderabad, Telangana — 500072<br />
                            <strong>GSTIN: 36AAACS7820Q1Z5</strong> | Phone: +91 98490 12345
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <h2 style={{ margin: 0, fontSize: '16px', color: '#2D5016', fontWeight: 800 }}>TAX INVOICE</h2>
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            <div>Invoice No: <strong>BILL-{invoiceModalOrder.id + 7820}</strong></div>
                            <div>Order Ref: <strong>#{invoiceModalOrder.id}</strong></div>
                            <div>Date: <strong>{new Date(invoiceModalOrder.createdAt || Date.now()).toLocaleDateString('en-IN')}</strong></div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', paddingBottom: '14px', borderBottom: '1px solid #E2E8F0', fontSize: '12px' }}>
                        <div>
                          <strong style={{ color: '#2D5016', display: 'block', marginBottom: '2px' }}>Billed / Delivered To:</strong>
                          <div style={{ fontWeight: 800 }}>{invoiceModalOrder.customerName || 'Customer'}</div>
                          <div>{invoiceModalOrder.deliveryAddress || 'Store Pickup'}</div>
                          {invoiceModalOrder.customerPhone && <div>Phone: {invoiceModalOrder.customerPhone}</div>}
                          {invoiceModalOrder.customerEmail && <div>Email: {invoiceModalOrder.customerEmail}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ color: '#2D5016', display: 'block', marginBottom: '2px' }}>Payment & Delivery Details:</strong>
                          <div>Payment Mode: <strong>{invoiceModalOrder.paymentGateway || invoiceModalOrder.paymentMethod || 'COD'}</strong></div>
                          <div>Payment Status: <strong>{invoiceModalOrder.paymentStatus || 'Pending'}</strong></div>
                          <div>Txn Ref: <strong>{invoiceModalOrder.paymentTxnId || `TXN-SIRI-${invoiceModalOrder.id}`}</strong></div>
                          <div>Delivery Slot: <strong>{invoiceModalOrder.deliverySlot || 'Standard Delivery'}</strong></div>
                        </div>
                      </div>

                      <table className="admin-invoice-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>ITEM DESCRIPTION</th>
                            <th>PACK SIZE</th>
                            <th>RATE (₹)</th>
                            <th>QTY</th>
                            <th style={{ textAlign: 'right' }}>AMOUNT (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(invoiceModalOrder.items || []).map((it, idx) => (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td><strong>{it.name}</strong></td>
                              <td>{it.weight ? `${it.weight}${it.unit}` : 'Standard'}</td>
                              <td>{formatPrice(it.price)}</td>
                              <td>{it.quantity || 1}</td>
                              <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatPrice(it.price * (it.quantity || 1))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {(() => {
                        const { subtotal, deliveryFee, discount, couponCode, grandTotal } = getOrderBillBreakdown(invoiceModalOrder);

                        return (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <div style={{ width: '280px', fontSize: '12.5px', lineHeight: '1.6' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Subtotal:</span>
                                <span>{formatPrice(subtotal)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Delivery Fee:</span>
                                <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : <strong style={{ color: '#2D5016' }}>FREE</strong>}</span>
                              </div>
                              {(discount > 0 || couponCode) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534', fontWeight: 600 }}>
                                  <span>Coupon ({couponCode || 'Applied'}):</span>
                                  <span>-{formatPrice(discount)}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #2D5016', paddingTop: '4px', marginTop: '4px', fontWeight: 900, fontSize: '15px', color: '#1C4B12' }}>
                                <span>Grand Total:</span>
                                <span>{formatPrice(grandTotal)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #E2E8F0', fontSize: '11px', color: '#687466' }}>
                        <div>
                          Thank you for choosing Siri Traders!<br />
                          For queries, contact support@siritrader.com
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ width: '140px', borderBottom: '1px solid #374151', marginBottom: '4px' }}></div>
                          <strong>Authorized Signatory</strong>
                        </div>
                      </div>
                    </div>

                    <div className="inventory-modal__footer admin-invoice-actions">
                      <button className="admin__ghost" onClick={() => setInvoiceModalOrder(null)}>Close</button>
                      <button className="admin__primary" onClick={() => window.print()}>
                        <FiPrinter /> Print Invoice
                      </button>
                    </div>
                  </div>
                </div>,
                document.getElementById('print-root')
              )}
            </div>
          )}

          {/* CUSTOMER HUB */}
          {activeTab === 'customers' && (
            <div className="admin-customers-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-card admin-card--wide" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="inventory-filters-tabs">
                    <button
                      className={`inventory-filter-btn ${customerSegmentFilter === 'all' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setCustomerSegmentFilter('all')}
                    >
                      All Customers <span className="inventory-badge-count">{liveCustomers?.length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${customerSegmentFilter === 'VIP' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setCustomerSegmentFilter('VIP')}
                    >
                      🌟 VIP / High-Value <span className="inventory-badge-count">{liveCustomers?.filter(c => c.segment === 'VIP').length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${customerSegmentFilter === 'Returning' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setCustomerSegmentFilter('Returning')}
                    >
                      🔁 Returning <span className="inventory-badge-count">{liveCustomers?.filter(c => c.segment === 'Returning').length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${customerSegmentFilter === 'New' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setCustomerSegmentFilter('New')}
                    >
                      🌱 New <span className="inventory-badge-count">{liveCustomers?.filter(c => c.segment === 'New').length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${customerSegmentFilter === 'Inactive' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setCustomerSegmentFilter('Inactive')}
                    >
                      💤 Inactive (30d+) <span className="inventory-badge-count">{liveCustomers?.filter(c => c.segment === 'Inactive').length || 0}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="admin-search-label" style={{ flex: 1, minWidth: '280px', maxWidth: '500px' }}>
                      <FiSearch />
                      <input
                        placeholder="Search by customer name, email or phone..."
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button className="admin__ghost" onClick={loadCustomers}>
                      <FiRefreshCw size={13} /> Refresh Customers
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid #E1E6DC', paddingTop: '12px' }}>
                    <span style={{ fontSize: '12px', color: '#687466' }}>
                      {selectedBroadcastEmails.length > 0
                        ? <strong style={{ color: '#2D5016' }}>{selectedBroadcastEmails.length} customer(s) selected for messaging</strong>
                        : 'No customers selected — check customers below, or select a whole segment tab above'}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button className="admin__ghost" style={{ fontSize: '11.5px', padding: '6px 12px' }} onClick={selectFilteredCustomers}>
                        Select {customerSegmentFilter === 'all' ? 'All' : customerSegmentFilter} ({filteredCustomers.length})
                      </button>
                      <button className="admin__ghost" style={{ fontSize: '11.5px', padding: '6px 12px' }} disabled={selectedBroadcastEmails.length === 0} onClick={clearCustomerSelection}>
                        Clear Selection
                      </button>
                      <button
                        className="admin__primary"
                        style={{ fontSize: '11.5px', padding: '6px 12px' }}
                        disabled={selectedBroadcastEmails.length === 0}
                        onClick={() => {
                          setActiveTab('broadcast');
                          setBroadcastSubject('');
                        }}
                      >
                        <FiMail size={12} /> Message Selected ({selectedBroadcastEmails.length})
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-customer-grid">
                {filteredCustomers.length === 0 ? (
                  <div className="admin-card admin-card--wide" style={{ textAlign: 'center', padding: '36px', color: '#687466', gridColumn: '1 / -1' }}>
                    No customer accounts found matching your filter.
                  </div>
                ) : filteredCustomers.map(customer => {
                  const initial = (customer.name || customer.email || 'C')[0].toUpperCase();

                  return (
                    <div key={customer.id} className="admin-customer-card">
                      <div className="admin-customer-card__header">
                        <input
                          type="checkbox"
                          className="admin-customer-select"
                          checked={selectedBroadcastEmails.includes(customer.email)}
                          onChange={() => toggleCustomerSelection(customer.email)}
                          aria-label={`Select ${customer.name || customer.email} for messaging`}
                        />
                        <div className="admin-customer-avatar">{initial}</div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13.5px', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {customer.name || 'Customer'}
                            </strong>
                            <span className={`admin-segment-pill admin-segment-pill--${(customer.segment || 'new').toLowerCase()}`}>
                              {customer.segment === 'VIP' ? '🌟 VIP' : (customer.segment || 'New')}
                            </span>
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#687466', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {customer.email}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                        <span style={{ color: '#687466' }}>Segment:</span>
                        <select
                          className="admin-segment-select"
                          value={customer.segmentOverride || ''}
                          onChange={(e) => setCustomerSegmentOverride(customer, e.target.value || null)}
                        >
                          <option value="">Auto ({customer.autoSegment || 'New'})</option>
                          <option value="VIP">VIP</option>
                          <option value="Returning">Returning</option>
                          <option value="New">New</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="admin-customer-stats-row">
                        <div>
                          <span>Total Spent</span>
                          <strong>{formatPrice(customer.totalSpent || 0)}</strong>
                        </div>
                        <div>
                          <span>Orders</span>
                          <strong>{customer.ordersCount || 0}</strong>
                        </div>
                        <div>
                          <span>Avg Order</span>
                          <strong>{formatPrice(customer.averageOrderValue || 0)}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#687466' }}>
                        <span>Phone: {customer.phone || '—'}</span>
                        <span>Joined: {new Date(customer.createdAt).toLocaleDateString('en-IN')}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                        <button
                          type="button"
                          className="admin__ghost"
                          style={{ flex: 1, height: '32px', fontSize: '11.5px' }}
                          onClick={() => setSelectedCustomerModal(customer)}
                        >
                          <FiEye size={12} /> View Profile & History
                        </button>
                        <button
                          type="button"
                          className="admin__primary"
                          style={{ height: '32px', padding: '0 12px', fontSize: '11.5px' }}
                          onClick={() => {
                            setActiveTab('broadcast');
                            setBroadcastSubject(`Special Offer for ${customer.name || 'Valued Customer'}`);
                            setSelectedBroadcastEmails([customer.email]);
                          }}
                        >
                          <FiMail size={12} /> Message
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedCustomerModal && (
                <div className="inventory-modal-backdrop" onClick={() => setSelectedCustomerModal(null)}>
                  <div className="inventory-modal" style={{ maxWidth: '780px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="admin-customer-avatar">
                          {(selectedCustomerModal.name || selectedCustomerModal.email || 'C')[0].toUpperCase()}
                        </div>
                        <div>
                          <h2 style={{ margin: 0 }}>{selectedCustomerModal.name || 'Customer Profile'}</h2>
                          <span style={{ fontSize: '11.5px', color: '#687466' }}>{selectedCustomerModal.email} · Phone: {selectedCustomerModal.phone || 'Not provided'}</span>
                        </div>
                      </div>
                      <button className="inventory-modal__close" onClick={() => setSelectedCustomerModal(null)}>✕</button>
                    </div>

                    <div className="inventory-modal__body" style={{ gap: '14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: '#FAF9F5', padding: '12px', borderRadius: '10px' }}>
                        <div>
                          <span style={{ fontSize: '10.5px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Total Spent</span>
                          <strong style={{ display: 'block', fontSize: '15px', color: '#1C4B12' }}>{formatPrice(selectedCustomerModal.totalSpent || 0)}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Total Orders</span>
                          <strong style={{ display: 'block', fontSize: '15px' }}>{selectedCustomerModal.ordersCount || 0}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Average Order</span>
                          <strong style={{ display: 'block', fontSize: '15px' }}>{formatPrice(selectedCustomerModal.averageOrderValue || 0)}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '10.5px', color: '#687466', textTransform: 'uppercase', fontWeight: 800 }}>Segment</span>
                          <div style={{ marginTop: '2px' }}>
                            <span className={`admin-segment-pill admin-segment-pill--${(selectedCustomerModal.segment || 'new').toLowerCase()}`}>
                              {selectedCustomerModal.segment || 'New'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 style={{ fontSize: '13px', color: '#1C4B12', margin: '0 0 8px', fontWeight: 800 }}>
                          Order History ({selectedCustomerModal.orderHistory?.length || 0})
                        </h3>
                        {(!selectedCustomerModal.orderHistory || selectedCustomerModal.orderHistory.length === 0) ? (
                          <p style={{ color: '#687466', fontSize: '12px', padding: '12px 0' }}>No past orders found for this customer.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                            {selectedCustomerModal.orderHistory.map(order => (
                              <div key={order.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#FFFFFF', border: '1px solid #E1E6DC', borderRadius: '8px', fontSize: '12px' }}>
                                <div>
                                  <strong>Order #{order.id}</strong> <span style={{ color: '#2D5016', fontWeight: 700 }}>BILL-{order.id + 7820}</span>
                                  <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>
                                    {new Date(order.createdAt).toLocaleString('en-IN')} · {order.items?.length || 0} items
                                  </span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <strong style={{ fontSize: '13px', display: 'block' }}>{formatPrice(order.total)}</strong>
                                  <span className={`admin-order-status-pill admin-order-status-pill--${(order.status || 'pending').toLowerCase().replace(/\s+/g, '-')}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                                    {order.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="inventory-modal__footer">
                      <button className="admin__primary" onClick={() => setSelectedCustomerModal(null)}>Close</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* GROCERY DELIVERY ZONES */}
          {activeTab === 'delivery-zones' && (
            <div className="admin-delivery-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-card admin-card--wide">
                <div className="admin-card__toolbar">
                  <div>
                    <h2 style={{ margin: 0 }}>Delivery Zones & Coverage</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#687466' }}>
                      Manage serviceable areas, pincodes, delivery fees and assigned drivers.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="admin__ghost"
                      onClick={() => { setEditingZoneModal(null); setShowZonesModal(true); }}
                    >
                      <FiMapPin /> Delivery Zones ({deliveryZones.length})
                    </button>
                    <button
                      type="button"
                      className="admin__primary"
                      onClick={() => {
                        setNewZone({
                          area: '',
                          pincode: '',
                          time: '30 mins',
                          distance: '',
                          deliveryFee: 0,
                          driverAssigned: ''
                        });
                        setShowAddZoneModal(true);
                      }}
                    >
                      <FiPlus /> Add New Delivery Area
                    </button>
                  </div>
                </div>
              </div>

              {/* Minimum Order Value Requirement */}
              <div style={{
                padding: '16px 18px',
                borderRadius: '12px',
                border: '2px solid #2D5016',
                background: '#F0FDF4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    💵 Minimum Order Value Requirement
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#374151', marginTop: '2px' }}>
                    Set the minimum cart subtotal required to place an order. Customers below this limit will be prompted to add more items. (Set 0 to disable).
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ position: 'relative', width: '130px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#166534', fontSize: '14px' }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={minOrderValueInput}
                      onChange={(e) => setMinOrderValueInput(e.target.value)}
                      placeholder="0"
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 26px',
                        borderRadius: '8px',
                        border: '1.5px solid #86EFAC',
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#166534',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="admin__primary"
                    disabled={apiLoading}
                    onClick={saveMinOrderSettings}
                    style={{ padding: '8px 18px', fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    Save Minimum Order
                  </button>
                </div>
              </div>

              {showZonesModal && (
                <div className="inventory-modal-backdrop" onClick={() => { setShowZonesModal(false); setEditingZoneModal(null); }}>
                  <div className="inventory-modal" style={{ maxWidth: '980px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <h2 style={{ margin: 0 }}>
                        {editingZoneModal ? `Edit ${editingZoneModal.area || 'Delivery Area'}` : `Serviceable Pincodes & Coverage (${deliveryZones.length})`}
                      </h2>
                      <button className="inventory-modal__close" onClick={() => { setShowZonesModal(false); setEditingZoneModal(null); }}>✕</button>
                    </div>

                    <div className="inventory-modal__body" style={{ gap: '14px' }}>
                      {editingZoneModal ? (
                        <>
                          <div className="admin-form__grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Area / Locality Name *</label>
                              <input
                                className="admin-input-box"
                                placeholder="e.g. Kukatpally, Madhapur"
                                value={editingZoneModal.area}
                                onChange={e => setEditingZoneModal(p => ({ ...p, area: e.target.value }))}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Pincode *</label>
                              <input
                                className="admin-input-box"
                                placeholder="e.g. 500072"
                                value={editingZoneModal.pincode}
                                onChange={e => setEditingZoneModal(p => ({ ...p, pincode: e.target.value }))}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Delivery Time Estimate</label>
                              <input
                                className="admin-input-box"
                                placeholder="e.g. 30 mins"
                                value={editingZoneModal.time}
                                onChange={e => setEditingZoneModal(p => ({ ...p, time: e.target.value }))}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Delivery Fee (₹)</label>
                              <input
                                className="admin-input-box"
                                type="number"
                                placeholder="e.g. 25"
                                value={editingZoneModal.deliveryFee}
                                onChange={e => setEditingZoneModal(p => ({ ...p, deliveryFee: Number(e.target.value) || 0 }))}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Assigned Driver / Partner</label>
                              <input
                                className="admin-input-box"
                                placeholder="e.g. Ramesh Kumar"
                                value={editingZoneModal.driverAssigned || ''}
                                onChange={e => setEditingZoneModal(p => ({ ...p, driverAssigned: e.target.value }))}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="admin__primary"
                              onClick={async () => {
                                try {
                                  const updated = await adminApi.updateDeliveryZone(editingZoneModal.id, editingZoneModal);
                                  setDeliveryZones(prev => prev.map(z => z.id === updated.id ? updated : z));
                                  setEditingZoneModal(null);
                                  setSaveToast({ type: 'success', msg: `Zone ${updated.area} updated successfully` });
                                  setTimeout(() => setSaveToast(null), 3000);
                                } catch (err) { alert(err.message); }
                              }}
                            >
                              <FiSave /> Save Changes
                            </button>
                            <button type="button" className="admin__ghost" onClick={() => setEditingZoneModal(null)}>
                              ← Back to List
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="admin-search-label" style={{ width: '260px' }}>
                            <FiSearch />
                            <input
                              placeholder="Search area or pincode..."
                              value={deliveryZoneSearch}
                              onChange={(e) => setDeliveryZoneSearch(e.target.value)}
                            />
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table className="inventory-table" style={{ minWidth: 0, width: '100%' }}>
                              <thead>
                                <tr>
                                  <th>AREA / LOCALITY</th>
                                  <th>PINCODE</th>
                                  <th>DELIVERY TIME</th>
                                  <th>FEE (₹)</th>
                                  <th>DRIVER ASSIGNED</th>
                                  <th>STATUS</th>
                                  <th style={{ textAlign: 'center' }}>ACTIONS</th>
                                </tr>
                              </thead>
                              <tbody>
                                {deliveryZones
                                  .filter(z => (z.area || '').toLowerCase().includes(deliveryZoneSearch.toLowerCase()) || (z.pincode || '').includes(deliveryZoneSearch))
                                  .map(zone => (
                                    <tr key={zone.id}>
                                      <td><strong>{zone.area}</strong></td>
                                      <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{zone.pincode}</span></td>
                                      <td>{zone.time}</td>
                                      <td>₹{zone.deliveryFee}</td>
                                      <td>{zone.driverAssigned || <span style={{ color: '#9CA3AF' }}>Unassigned</span>}</td>
                                      <td>
                                        <button
                                          type="button"
                                          style={{
                                            background: zone.active !== false ? '#DCFCE7' : '#F3F4F6',
                                            color: zone.active !== false ? '#166534' : '#6B7280',
                                            border: 'none',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            cursor: 'pointer'
                                          }}
                                          onClick={async () => {
                                            const nextActive = zone.active === false ? true : false;
                                            try {
                                              const updated = await adminApi.updateDeliveryZone(zone.id, { active: nextActive });
                                              setDeliveryZones(prev => prev.map(z => z.id === updated.id ? updated : z));
                                            } catch (err) { alert(err.message); }
                                          }}
                                        >
                                          {zone.active !== false ? '🟢 Active' : '⚪ Inactive'}
                                        </button>
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                          <button
                                            className="admin__ghost"
                                            style={{ width: '30px', height: '30px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={() => setEditingZoneModal(zone)}
                                          >
                                            <FiEdit2 size={12} />
                                          </button>
                                          <button
                                            className="admin-danger"
                                            style={{ width: '30px', height: '30px', padding: 0, borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={async () => {
                                              if (window.confirm(`Delete ${zone.area} pincode zone?`)) {
                                                try {
                                                  await adminApi.deleteDeliveryZone(zone.id);
                                                  setDeliveryZones(prev => prev.filter(z => z.id !== zone.id));
                                                } catch (err) { alert(err.message); }
                                              }
                                            }}
                                          >
                                            <FiTrash2 size={12} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="inventory-modal__footer">
                      <button className="admin__primary" onClick={() => { setShowZonesModal(false); setEditingZoneModal(null); }}>Close</button>
                    </div>
                  </div>
                </div>
              )}

              {showAddZoneModal && (
                <div className="inventory-modal-backdrop" onClick={() => setShowAddZoneModal(false)}>
                  <div className="inventory-modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <h2 style={{ margin: 0 }}>Add New Delivery Area</h2>
                      <button className="inventory-modal__close" onClick={() => setShowAddZoneModal(false)}>✕</button>
                    </div>

                    <div className="inventory-modal__body">
                      <div className="admin-form__grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Area / Locality Name *</label>
                          <input
                            className="admin-input-box"
                            placeholder="e.g. Kukatpally, Madhapur"
                            value={newZone.area}
                            onChange={e => setNewZone(p => ({ ...p, area: e.target.value }))}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Pincode *</label>
                          <input
                            className="admin-input-box"
                            placeholder="e.g. 500072"
                            value={newZone.pincode}
                            onChange={e => setNewZone(p => ({ ...p, pincode: e.target.value }))}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Delivery Time Estimate</label>
                          <input
                            className="admin-input-box"
                            placeholder="e.g. 30 mins"
                            value={newZone.time}
                            onChange={e => setNewZone(p => ({ ...p, time: e.target.value }))}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Delivery Fee (₹)</label>
                          <input
                            className="admin-input-box"
                            type="number"
                            placeholder="e.g. 25"
                            value={newZone.deliveryFee}
                            onChange={e => setNewZone(p => ({ ...p, deliveryFee: Number(e.target.value) || 0 }))}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Assigned Driver / Partner</label>
                          <input
                            className="admin-input-box"
                            placeholder="e.g. Ramesh Kumar"
                            value={newZone.driverAssigned}
                            onChange={e => setNewZone(p => ({ ...p, driverAssigned: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="inventory-modal__footer">
                      <button type="button" className="admin__ghost" onClick={() => setShowAddZoneModal(false)}>Cancel</button>
                      <button
                        type="button"
                        className="admin__primary"
                        onClick={async () => {
                          if (!newZone.area.trim() || !newZone.pincode.trim()) return;
                          try {
                            const saved = await adminApi.saveDeliveryZone({
                              ...newZone,
                              area: newZone.area.trim(),
                              pincode: newZone.pincode.trim()
                            });
                            setDeliveryZones(prev => [...prev, saved]);
                            setNewZone({
                              area: '',
                              pincode: '',
                              time: '30 mins',
                              distance: '',
                              deliveryFee: 0,
                              driverAssigned: ''
                            });
                            setShowAddZoneModal(false);
                            setSaveToast({ type: 'success', msg: `Zone ${saved.area} created` });
                            setTimeout(() => setSaveToast(null), 3000);
                          } catch (err) { alert(err.message); }
                        }}
                      >
                        <FiPlus /> Add Delivery Zone
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MINIMUM ORDER VALUE CONFIGURATION */}
          {activeTab === 'min-order-value' && (
            <div className="admin-card admin-card--wide" style={{ padding: '24px' }}>
              <div className="admin-card__toolbar" style={{ borderBottom: '1px solid #E1E6DC', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#1C4B12', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiDollarSign /> Minimum Order Value Configuration
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#687466' }}>
                    Set the minimum order value required for customers to place an order. If a customer's cart subtotal is below this limit, checkout is blocked and a prompt directs them to add more items.
                  </p>
                </div>
              </div>

              <div style={{
                padding: '24px',
                borderRadius: '16px',
                border: '2px solid #86EFAC',
                background: '#F0FDF4',
                maxWidth: '600px'
              }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 800, color: '#166534', marginBottom: '8px' }}>
                  Minimum Cart Subtotal (₹)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: '200px' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#166534', fontSize: '16px' }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={minOrderValueInput}
                      onChange={(e) => setMinOrderValueInput(e.target.value)}
                      placeholder="0"
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 32px',
                        borderRadius: '10px',
                        border: '2px solid #86EFAC',
                        fontSize: '16px',
                        fontWeight: 800,
                        color: '#166534',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="admin__primary"
                    disabled={apiLoading}
                    onClick={saveMinOrderSettings}
                    style={{ padding: '10px 24px', fontSize: '14px', whiteSpace: 'nowrap' }}
                  >
                    <FiSave /> {apiLoading ? 'Saving...' : 'Save Minimum Order Value'}
                  </button>
                </div>
                <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#4B5563', lineHeight: 1.5 }}>
                  💡 Set to <strong>₹0</strong> to disable minimum order restriction completely.
                </p>
              </div>
            </div>
          )}

          {/* GROCERY INVENTORY HUB */}
          {activeTab === 'inventory' && (
            <div className="admin-inventory-page">
              <div className="inventory-alerts-container">
                {invSummary.outOfStockCount > 0 && (
                  <div className="inventory-alert-banner inventory-alert-banner--danger">
                    <div className="inventory-alert-banner__content">
                      <FiAlertCircle size={20} />
                      <span><strong>Out of Stock Alert:</strong> {invSummary.outOfStockCount} grocery product(s) have 0 available units.</span>
                    </div>
                    <button className="inventory-alert-banner__btn" onClick={() => setInventoryFilter('out-of-stock')}>View Out of Stock</button>
                  </div>
                )}
                {invSummary.lowStockCount > 0 && (
                  <div className="inventory-alert-banner inventory-alert-banner--warning">
                    <div className="inventory-alert-banner__content">
                      <FiAlertTriangle size={20} />
                      <span><strong>Low Stock Alert:</strong> {invSummary.lowStockCount} product(s) are low in stock.</span>
                    </div>
                    <button className="inventory-alert-banner__btn" onClick={() => setInventoryFilter('low-stock')}>View Low Stock</button>
                  </div>
                )}
              </div>

              <section className="inventory-kpi-grid">
                <div className="inventory-kpi-card">
                  <div className="inventory-kpi-card__header">
                    <span className="inventory-kpi-card__label">Total Inventory Valuation</span>
                    <FiDollarSign className="inventory-kpi-card__icon" />
                  </div>
                  <strong>{formatPrice(invSummary.totalValuation)}</strong>
                  <small>Retail Value: {formatPrice(invSummary.totalRetailValuation)}</small>
                </div>

                <div className="inventory-kpi-card">
                  <div className="inventory-kpi-card__header">
                    <span className="inventory-kpi-card__label">Total Stock Units</span>
                    <FiPackage className="inventory-kpi-card__icon" />
                  </div>
                  <strong>{invSummary.totalAvailableUnits.toLocaleString('en-IN')}</strong>
                  <small>Available for customer orders</small>
                </div>

                <div className={`inventory-kpi-card ${invSummary.lowStockCount > 0 ? 'inventory-kpi-card--warning' : ''}`}>
                  <div className="inventory-kpi-card__header">
                    <span className="inventory-kpi-card__label">Low Stock Alerts</span>
                    <FiAlertTriangle className="inventory-kpi-card__icon" style={{ color: invSummary.lowStockCount > 0 ? '#F59E0B' : undefined }} />
                  </div>
                  <strong style={{ color: invSummary.lowStockCount > 0 ? '#B45309' : undefined }}>{invSummary.lowStockCount}</strong>
                  <small>Low stock count</small>
                </div>

                <div className={`inventory-kpi-card ${invSummary.outOfStockCount > 0 ? 'inventory-kpi-card--danger' : ''}`}>
                  <div className="inventory-kpi-card__header">
                    <span className="inventory-kpi-card__label">Out of Stock</span>
                    <FiAlertCircle className="inventory-kpi-card__icon" style={{ color: invSummary.outOfStockCount > 0 ? '#EF4444' : undefined }} />
                  </div>
                  <strong style={{ color: invSummary.outOfStockCount > 0 ? '#B91C1C' : undefined }}>{invSummary.outOfStockCount}</strong>
                  <small>0 available units</small>
                </div>
              </section>

              <div className="admin-card admin-card--wide" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="inventory-filters-tabs">
                    <button
                      className={`inventory-filter-btn ${inventoryFilter === 'all' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setInventoryFilter('all')}
                    >
                      All Items <span className="inventory-badge-count">{inventoryData?.items?.length || 0}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${inventoryFilter === 'low-stock' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setInventoryFilter('low-stock')}
                    >
                      ⚠️ Low Stock <span className="inventory-badge-count">{invSummary.lowStockCount}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${inventoryFilter === 'out-of-stock' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setInventoryFilter('out-of-stock')}
                    >
                      ❌ Out of Stock <span className="inventory-badge-count">{invSummary.outOfStockCount}</span>
                    </button>
                    <button
                      className={`inventory-filter-btn ${inventoryFilter === 'logs' ? 'inventory-filter-btn--active' : ''}`}
                      onClick={() => setInventoryFilter('logs')}
                    >
                      📋 Movement & Adjustments Log
                    </button>
                  </div>

                  {inventoryFilter !== 'logs' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px', maxWidth: '600px' }}>
                        <div className="admin-search-label" style={{ flex: 1 }}>
                          <FiSearch />
                          <input
                            placeholder="Search item name, brand, or batch..."
                            value={inventorySearch}
                            onChange={(e) => setInventorySearch(e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <select
                          className="admin-input-box"
                          style={{ width: '160px', height: '38px', borderRadius: '10px' }}
                          value={inventoryCategory}
                          onChange={(e) => setInventoryCategory(e.target.value)}
                        >
                          <option value="all">All Categories</option>
                          {dbCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="admin__ghost" onClick={loadInventory} style={{ height: '38px', padding: '0 12px', fontSize: '12px' }}>
                          <FiRefreshCw size={13} /> Refresh
                        </button>
                        <button className="admin__ghost" onClick={exportInventoryCsv} style={{ height: '38px', padding: '0 14px', fontSize: '12px' }}>
                          📥 Export CSV
                        </button>
                        <button
                          className="admin__primary"
                          style={{ height: '38px', padding: '0 14px', fontSize: '12px' }}
                          onClick={() => {
                            setProductDraft({ ...blankProduct, isPublished: false });
                            setProductModalMode('inventory');
                            setDetailedVariants([]);
                            setShowProductModal(true);
                          }}
                        >
                          <FiPlus size={13} /> Add Item
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {inventoryFilter !== 'logs' ? (
                <div className="inventory-table-wrap">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>ITEM / BATCH DETAILS</th>
                        <th>CATEGORY</th>
                        <th>AVAILABLE</th>
                        <th>DAMAGED / RETURNED</th>
                        <th>INCOMING</th>
                        <th>UNIT COST / VALUE</th>
                        <th style={{ textAlign: 'center' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryLoading ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#687466' }}>
                            Loading live inventory tracking...
                          </td>
                        </tr>
                      ) : filteredInventoryItems.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#687466' }}>
                            No inventory items matching your filter/search.
                          </td>
                        </tr>
                      ) : filteredInventoryItems.map(item => {
                          const dbProd = dbProductsList.find(p => String(p.id) === String(item.productId));
                          const isPublished = item.isPublished !== undefined ? item.isPublished : (dbProd ? dbProd.isPublished !== false : true);

                          return (

                        <tr key={item.productId}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <ProductImage src={item.image} name={item.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                              <div>
                                <strong style={{ fontSize: '13px', color: '#111827' }}>{item.name}</strong>
                                <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>
                                  {item.brand ? `${item.brand} · ` : ''}{item.weight}{item.unit}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'capitalize', color: '#2D5016' }}>
                              {item.category}
                            </span>
                          </td>

                          <td>
                            <span className={`inventory-pill ${item.isOutOfStock ? 'inventory-pill--out' : (item.isLowStock ? 'inventory-pill--low' : 'inventory-pill--available')}`}>
                              {item.availableStock} units
                            </span>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
                              {item.damagedStock > 0 && <span style={{ color: '#9D174D' }}>Damaged: {item.damagedStock}</span>}
                              {item.returnedStock > 0 && <span style={{ color: '#6B21A8' }}>Returned: {item.returnedStock}</span>}
                              {item.damagedStock === 0 && item.returnedStock === 0 && <span style={{ color: '#9CA3AF' }}>0</span>}
                            </div>
                          </td>

                          <td>{item.incomingStock > 0 ? `+${item.incomingStock}` : 0}</td>

                          <td>
                            <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>Cost: {formatPrice(item.costPrice)}</span>
                            <span style={{ fontSize: '11px', color: '#2D5016', display: 'block' }}>Sell: {formatPrice(item.price)}</span>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <button
                                className="admin__primary"
                                style={{ height: '32px', padding: '0 12px', fontSize: '11px', borderRadius: '6px' }}
                                onClick={() => {
                                  setAdjustModalItem(item);
                                  setAdjustForm({
                                    changeType: 'ADD',
                                    quantity: '',
                                    targetField: 'availableStock',
                                    reason: 'Purchase / New Stock Received',
                                    notes: ''
                                  });
                                }}
                              >
                                Update Stock
                              </button>
                              <button
                                style={{
                                  height: '32px', padding: '0 10px', fontSize: '11px', borderRadius: '6px',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  background: isPublished ? '#FEF3C7' : '#DCFCE7',
                                  color: isPublished ? '#92400E' : '#166534',
                                  border: `1px solid ${isPublished ? '#FCD34D' : '#86EFAC'}`,
                                  cursor: 'pointer', fontWeight: 600
                                }}
                                title={isPublished ? 'Remove from website' : 'Upload to website'}
                                onClick={() => {
                                  const target = dbProd
                                    ? { ...dbProd, isPublished }
                                    : { id: item.productId, name: item.name, isPublished };
                                  togglePublishProduct(target);
                                }}
                              >
                                {isPublished ? '🌐 Remove from Website' : '🌐 Upload to Website'}
                              </button>
                              <button
                                className="admin-danger"
                                style={{ height: '32px', padding: '0 10px', fontSize: '11px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Delete Product"
                                onClick={() => removeProduct(item.productId)}
                              >
                                <FiTrash2 size={12} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-card admin-card--wide">
                  <div className="admin-card__toolbar">
                    <h2>Stock Movement & Adjustment History</h2>
                    <button className="admin__ghost" onClick={loadInventoryLogs}>
                      <FiRefreshCw size={13} /> Refresh Logs
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>DATE & TIME</th>
                          <th>PRODUCT</th>
                          <th>ACTION</th>
                          <th>BEFORE ➔ AFTER</th>
                          <th>REASON</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryLogs.map(log => (
                          <tr key={log.id}>
                            <td style={{ fontSize: '11.5px', color: '#687466' }}>{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                            <td><strong>{log.productName}</strong></td>
                            <td>{log.changeType}</td>
                            <td>{log.stockBefore} ➔ {log.stockAfter}</td>
                            <td>{log.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}



              {/* MODALS FOR INVENTORY */}
              {adjustModalItem && (() => {

                const currentStock = adjustModalItem.availableStock ?? 0;
                const qty = parseInt(adjustForm.quantity, 10) || 0;
                const previewStock = adjustForm.changeType === 'ADD'
                  ? currentStock + qty
                  : adjustForm.changeType === 'SET'
                  ? qty
                  : currentStock;
                const actionDescriptions = {
                  ADD: 'Increases the available stock count. Use this when new goods arrive.',
                  SET: 'Directly sets the stock to the exact number you enter. Use this after a physical count.',
                  DAMAGE: 'Moves items out of available stock and records them as damaged.',
                  EXPIRED: 'Moves items out of available stock and records them as expired.',
                };
                return (
                  <div className="inventory-modal-backdrop" onClick={() => setAdjustModalItem(null)}>
                    <div className="inventory-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '100%' }}>
                      <div className="inventory-modal__header">
                        <div>
                          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1C4B12' }}>Update Stock</h2>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#687466' }}>{adjustModalItem.name}</p>
                        </div>
                        <button className="inventory-modal__close" onClick={() => setAdjustModalItem(null)}>✕</button>
                      </div>

                      {/* Current Stock Banner */}
                      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 14px', margin: '14px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>Current Available Stock</span>
                        <strong style={{ fontSize: '18px', color: '#166534' }}>{currentStock} units</strong>
                      </div>

                      <form onSubmit={handleStockAdjustment}>
                        <div className="inventory-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                          {/* Action Type */}
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                              What do you want to do?
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              {[
                                { value: 'ADD', label: '+ Add Stock', emoji: '📦', desc: 'New goods arrived' },
                                { value: 'SET', label: '= Set Count', emoji: '📝', desc: 'After physical count' },
                                { value: 'DAMAGE', label: '⚠ Damaged', emoji: '⚠️', desc: 'Goods are damaged' },
                                { value: 'EXPIRED', label: '⛔ Expired', emoji: '🗑️', desc: 'Goods have expired' },
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setAdjustForm(prev => ({
                                    ...prev,
                                    changeType: opt.value,
                                    targetField: opt.value === 'DAMAGE' ? 'damagedStock' : opt.value === 'EXPIRED' ? 'expiredStock' : 'availableStock',
                                    reason: opt.value === 'ADD' ? 'Purchase / New Stock Received' : opt.value === 'DAMAGE' ? 'Damaged in transit' : opt.value === 'EXPIRED' ? 'Expired goods' : 'Stock count correction',
                                  }))}
                                  style={{
                                    padding: '10px 8px',
                                    borderRadius: '8px',
                                    border: adjustForm.changeType === opt.value ? '2px solid #2D5016' : '1px solid #E1E6DC',
                                    background: adjustForm.changeType === opt.value ? '#F0FDF4' : '#FAFAF8',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: adjustForm.changeType === opt.value ? '#1C4B12' : '#374151' }}>{opt.label}</div>
                                  <div style={{ fontSize: '11px', color: '#687466', marginTop: '2px' }}>{opt.desc}</div>
                                </button>
                              ))}
                            </div>
                            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#687466', fontStyle: 'italic' }}>
                              {actionDescriptions[adjustForm.changeType]}
                            </p>
                          </div>

                          {/* Quantity with live preview */}
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                              Quantity (number of units)
                            </label>
                            <input
                              type="number"
                              className="admin-input-box"
                              min={adjustForm.changeType === 'SET' ? "0" : "1"}
                              placeholder={adjustForm.changeType === 'SET' ? "e.g. 0" : "e.g. 50"}
                              value={adjustForm.quantity}
                              onChange={(e) => setAdjustForm(prev => ({ ...prev, quantity: e.target.value }))}
                              required
                              style={{ fontSize: '15px', fontWeight: 600 }}
                            />
                            {adjustForm.quantity !== '' && !isNaN(parseInt(adjustForm.quantity, 10)) && (adjustForm.changeType === 'ADD' || adjustForm.changeType === 'SET') && (
                              <div style={{ marginTop: '6px', padding: '6px 10px', background: '#EFF6FF', borderRadius: '6px', fontSize: '11.5px', color: '#1E40AF', fontWeight: 600 }}>
                                {adjustForm.changeType === 'ADD'
                                  ? `After adding: ${currentStock} + ${qty} = ${previewStock} units`
                                  : `Stock will be set to exactly: ${qty} units`}
                              </div>
                            )}
                          </div>

                          {/* Reason */}
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#374151' }}>
                              Reason <span style={{ fontWeight: 400, color: '#687466' }}>(for your records)</span>
                            </label>
                            <input
                              type="text"
                              className="admin-input-box"
                              placeholder="e.g. Received from supplier"
                              value={adjustForm.reason}
                              onChange={(e) => setAdjustForm(prev => ({ ...prev, reason: e.target.value }))}
                              required
                            />
                          </div>
                        </div>

                        <div className="inventory-modal__footer">
                          <button type="button" className="admin__ghost" onClick={() => setAdjustModalItem(null)}>Cancel</button>
                          <button
                            type="submit"
                            className="admin__primary"
                            disabled={adjustLoading || !adjustForm.quantity}
                            style={{ minWidth: '120px' }}
                          >
                            {adjustLoading ? 'Saving...' : '✓ Confirm Update'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })()}

              {historyModalItem && (
                <div className="inventory-modal-backdrop" onClick={() => setHistoryModalItem(null)}>
                  <div className="inventory-modal" onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <h2>Movement History — {historyModalItem.name}</h2>
                      <button className="inventory-modal__close" onClick={() => setHistoryModalItem(null)}>✕</button>
                    </div>
                    <div className="inventory-modal__body">
                      {historyLogs.map(log => (
                        <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                          <div>
                            <strong>{log.reason} ({log.changeType})</strong>
                            <span style={{ fontSize: '11px', color: '#687466', display: 'block' }}>{new Date(log.createdAt).toLocaleString('en-IN')}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong>{log.quantity > 0 ? `+${log.quantity}` : log.quantity}</strong>
                            <span style={{ fontSize: '11px', color: '#2D5016', display: 'block' }}>{log.stockBefore} ➔ {log.stockAfter}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="inventory-modal__footer">
                      <button className="admin__primary" onClick={() => setHistoryModalItem(null)}>Close</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* GROCERY PRODUCTS CATALOG (UNIFIED RETAIL & WHOLESALE) */}
          {(activeTab === 'products' || activeTab === 'retail-products' || activeTab === 'wholesale-products') && (
            <div className="admin-products-page" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-card admin-card--wide">
                <div className="admin-card__toolbar">
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {activeTab === 'products' ? 'Product Catalog' : (activeTab === 'wholesale-products' ? 'Wholesale Items' : 'Retail Items')} ({filteredProducts.length})
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#687466' }}>
                      Manage products, availability modes (Retail, Wholesale, or both), and categories.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="admin__ghost" onClick={() => setShowCategoryModal(true)}>
                      <FiLayers /> Add New Category
                    </button>
                    <button
                      type="button"
                      className="admin__primary"
                      onClick={() => {
                        setProductDraft(blankProduct);
                        setProductModalMode('retail');
                        setDetailedVariants([]);
                        setShowProductModal(true);
                      }}
                    >
                      <FiPlus /> Add New Item
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                  <div className="admin-search-label" style={{ flex: 1, minWidth: '220px', maxWidth: '420px' }}>
                    <FiSearch />
                    <input
                      placeholder="Search by name, brand, SKU, barcode..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <select
                    className="admin-input-box"
                    style={{ width: 'auto', minWidth: '160px' }}
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {dbCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    className="admin-input-box"
                    style={{ width: 'auto', minWidth: '170px' }}
                    value={productTargetFilter}
                    onChange={(e) => setProductTargetFilter(e.target.value)}
                  >
                    <option value="all">All Availability</option>
                    <option value="retail_and_wholesale">Retail & Wholesale</option>
                    <option value="retail">Retail Only</option>
                    <option value="wholesale">Wholesale Only</option>
                  </select>

                </div>
              </div>

              {/* Listing */}
              <div className="admin-card admin-card--wide">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredProducts.map(product => (
                    <div key={product.id} className="admin-product-card-enhanced">
                      <div className="admin-product-top-row">
                        <div className="admin-product-info">
                          <ProductImage src={product.image} name={product.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong className="admin-product-info__name">{product.name}</strong>
                              {(() => {
                                const target = product.targetType || (product.wholesalePrice ? 'wholesale' : 'retail_and_wholesale');
                                let label = 'Retail & Wholesale';
                                let bg = '#DCFCE7';
                                let color = '#166534';
                                if (target === 'retail') {
                                  label = 'Retail Only';
                                  bg = '#DBEAFE';
                                  color = '#1E40AF';
                                } else if (target === 'wholesale') {
                                  label = 'Wholesale Only';
                                  bg = '#F3E8FF';
                                  color = '#6B21A8';
                                }
                                return (
                                  <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', background: bg, color: color }}>
                                    {label}
                                  </span>
                                );
                              })()}
                            </div>
                            <span className="admin-product-info__meta">{product.brand} · {product.category} · {product.weight}{product.unit}</span>
                          </div>
                        </div>
                        <div className="admin-product-price">
                          <strong style={{ fontSize: '15px' }}>{formatPrice(product.price)}</strong>
                        </div>
                        <div className="admin-product-actions">
                          <button className="admin__ghost" style={{ padding: '6px 10px', fontSize: '11.5px' }} onClick={() => editProduct(product)}>
                            <FiEdit2 size={12} /> Edit
                          </button>
                          <button className="admin-danger" style={{ padding: '6px 10px', fontSize: '11.5px' }} onClick={() => removeProduct(product.id)}>
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showCategoryModal && (
                <div className="inventory-modal-backdrop">
                  <div className="inventory-modal" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
                    <div className="inventory-modal__header">
                      <h2 style={{ margin: 0 }}>Add New Category</h2>
                      <button className="inventory-modal__close" onClick={() => setShowCategoryModal(false)}>✕</button>
                    </div>

                    <div className="inventory-modal__body">
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Category Name *</label>
                        <input
                          className="admin-input-box"
                          placeholder="e.g. Snacks & Namkeen"
                          value={categoryDraft.name}
                          onChange={(e) => setCategoryDraft(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>

                      <div style={{ marginTop: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Category Image URL</label>
                        <input
                          className="admin-input-box"
                          placeholder="https://images.unsplash.com/..."
                          value={categoryDraft.image}
                          onChange={(e) => setCategoryDraft(prev => ({ ...prev, image: e.target.value }))}
                        />
                        <label className="admin-file-input" style={{ marginTop: '6px' }}>
                          <span>Or choose image from device</span>
                          <input type="file" accept="image/*" onChange={handleCategoryImageUpload} />
                        </label>
                        {categoryDraft.image && (
                          <img src={toWebpImage(categoryDraft.image)} alt="Category preview" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', marginTop: '8px' }} />
                        )}
                      </div>

                      <div style={{ marginTop: '18px', borderTop: '1px solid #E1E6DC', paddingTop: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#687466', textTransform: 'uppercase' }}>
                          Existing Categories ({dbCategories.length})
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                          {dbCategories.map(cat => (
                            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#FAF9F5', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {cat.image && <img src={toWebpImage(cat.image)} alt={cat.name} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />}
                                <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{cat.name}</span>
                              </div>
                              <button className="admin-danger" style={{ padding: '4px 8px' }} onClick={() => deleteCategoryHandler(cat)}>
                                <FiTrash2 size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="inventory-modal__footer">
                      <button type="button" className="admin__ghost" onClick={() => setShowCategoryModal(false)}>Close</button>
                      <button type="button" className="admin__primary" disabled={categoryLoading || imageUploading} onClick={saveCategory}>
                        {categoryLoading ? 'Saving...' : <><FiPlus /> Add Category</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add/Edit product modal — lives outside the tab check above so it can
              also be opened from the Inventory Hub's "Add New Item" button
              without switching tabs. */}
          {showProductModal && (
            <div className="inventory-modal-backdrop">
              <div className="inventory-modal" style={{ maxWidth: '860px' }} onClick={e => e.stopPropagation()}>
                <div className="inventory-modal__header">
                  <div>
                    <h2 style={{ margin: 0 }}>{productDraft.id ? 'Edit Grocery Item' : 'Add New Item'}</h2>
                    {productDraft.id && (
                      <span style={{ fontSize: '11px', color: '#687466' }}>Editing ID #{productDraft.id}</span>
                    )}
                  </div>
                  <button className="inventory-modal__close" onClick={() => setShowProductModal(false)}>✕</button>
                </div>

                <form onSubmit={saveProduct}>
                  <div className="inventory-modal__body">
                    <div className="admin-form-section">
                      <h3 className="admin-form-section__title"><FiPackage /> 1. General Product Information</h3>
                      <div className="admin-form__grid">
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Product Name *</label>
                          <input className="admin-input-box" value={productDraft.name} onChange={(e) => setProductDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Dawat Lovely Gold Biryani Rice" required />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Target Availability *</label>
                          <select
                            className="admin-input-box"
                            value={productDraft.targetType || 'retail_and_wholesale'}
                            onChange={(e) => setProductDraft(prev => ({ ...prev, targetType: e.target.value }))}
                            required
                          >
                            <option value="retail_and_wholesale">Retail and Wholesale</option>
                            <option value="retail">Retail Only</option>
                            <option value="wholesale">Wholesale Only</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Category *</label>
                          <select className="admin-input-box" value={productDraft.category} onChange={(e) => setProductDraft(prev => ({ ...prev, category: e.target.value }))} required>
                            <option value="" disabled>
                              {dbCategories.length ? 'Select a category…' : 'No categories yet — add one first'}
                            </option>
                            {dbCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Brand</label>
                          <input className="admin-input-box" value={productDraft.brand || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, brand: e.target.value }))} placeholder="e.g. Daawat, Fortune, Siri Select" />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Pack Size / Weight</label>
                          <input className="admin-input-box" value={productDraft.weight || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, weight: e.target.value }))} placeholder="e.g. 500, 1, 5" />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Unit</label>
                          <select className="admin-input-box" value={productDraft.unit || 'g'} onChange={(e) => setProductDraft(prev => ({ ...prev, unit: e.target.value }))}>
                            <option value="g">Grams (g)</option>
                            <option value="kg">Kilograms (kg)</option>
                            <option value="ml">Millilitres (ml)</option>
                            <option value="L">Litres (L)</option>
                            <option value="pcs">Pieces (pcs)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Product Image URL</label>
                        <input className="admin-input-box" value={productDraft.image || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, image: e.target.value }))} placeholder="https://images.unsplash.com/..." />
                        <label className="admin-file-input" style={{ marginTop: '6px' }}>
                          <span>Or choose image from device</span>
                          <input type="file" accept="image/*" onChange={handleImageUpload} />
                        </label>
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Description</label>
                        <textarea
                          className="admin-input-box"
                          style={{ height: 'auto' }}
                          rows={3}
                          value={productDraft.description || ''}
                          onChange={(e) => setProductDraft(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Shown on the product page — e.g. Urad Dal (Split Black Gram). Essential for dal makhani and idli batter."
                        />
                      </div>
                    </div>

                    <div className="admin-form-section">
                      <h3 className="admin-form-section__title"><FiDollarSign /> 2. Pricing & Cost</h3>
                      <div className="admin-form__grid">
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Selling Price (₹) *</label>
                          <input className="admin-input-box" value={productDraft.price} onChange={(e) => setProductDraft(prev => ({ ...prev, price: e.target.value }))} placeholder="420" type="number" required />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>MRP (₹)</label>
                          <input className="admin-input-box" value={productDraft.mrp} onChange={(e) => setProductDraft(prev => ({ ...prev, mrp: e.target.value }))} placeholder="490" type="number" />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Cost Price (₹)</label>
                          <input className="admin-input-box" value={productDraft.costPrice} onChange={(e) => setProductDraft(prev => ({ ...prev, costPrice: e.target.value }))} placeholder="330" type="number" />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Wholesale Price (₹)</label>
                          <input className="admin-input-box" value={productDraft.wholesalePrice || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, wholesalePrice: e.target.value }))} placeholder="e.g. 380" type="number" />
                        </div>
                      </div>
                    </div>

                    {(productDraft.targetType === 'wholesale' || productDraft.targetType === 'retail_and_wholesale' || productDraft.targetType === 'both' || !productDraft.targetType || productModalMode === 'wholesale' || productDraft.wholesalePrice) && (
                      <div className="admin-form-section">
                        <h3 className="admin-form-section__title"><FiLayers /> 3. Wholesale & Bulk Pricing Options</h3>
                        <p style={{ fontSize: '11.5px', color: '#687466', margin: '0 0 10px' }}>
                          Define bulk pack prices and wholesale quantity tiers (e.g. 5 kg bulk, 10 kg case).
                        </p>

                        <div className="admin-form__grid" style={{ marginBottom: '14px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Bulk Pack Label</label>
                            <input className="admin-input-box" value={productDraft.bulkPackLabel || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, bulkPackLabel: e.target.value }))} placeholder="e.g. 5 kg bulk" />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Bulk Pack Price (₹)</label>
                            <input className="admin-input-box" value={productDraft.bulkPackPrice || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, bulkPackPrice: e.target.value }))} placeholder="e.g. 1850" type="number" />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Wholesale Case Label</label>
                            <input className="admin-input-box" value={productDraft.wholesaleCaseLabel || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, wholesaleCaseLabel: e.target.value }))} placeholder="e.g. 10 kg case" />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Wholesale Case Price (₹)</label>
                            <input className="admin-input-box" value={productDraft.wholesaleCasePrice || ''} onChange={(e) => setProductDraft(prev => ({ ...prev, wholesaleCasePrice: e.target.value }))} placeholder="e.g. 3600" type="number" />
                          </div>
                        </div>

                        <h4 style={{ fontSize: '12.5px', fontWeight: 700, margin: '12px 0 6px', color: '#2D5016' }}>Custom Wholesale Price Ranges / Tiers</h4>
                        {detailedVariants.map((v, idx) => (
                          <div key={v.id || idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                            <input
                              className="admin-input-box"
                              style={{ flex: 2 }}
                              placeholder="e.g. 5 kg bulk"
                              value={v.label}
                              onChange={(e) => updateVariantRow(idx, 'label', e.target.value)}
                            />
                            <input
                              className="admin-input-box"
                              style={{ flex: 1 }}
                              type="number"
                              placeholder="Price ₹"
                              value={v.price}
                              onChange={(e) => updateVariantRow(idx, 'price', e.target.value)}
                            />
                            <button type="button" className="admin-danger" style={{ padding: '8px', flexShrink: 0 }} onClick={() => removeVariantRow(idx)}>
                              <FiTrash2 size={12} />
                            </button>
                          </div>
                        ))}

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                          <button type="button" className="admin__ghost" onClick={() => addVariantRow(`${productDraft.weight || '1'} ${productDraft.unit || 'kg'}`, productDraft.price)}>
                            <FiPlus /> Base ({productDraft.weight || '1'}{productDraft.unit || 'kg'})
                          </button>
                          <button type="button" className="admin__ghost" onClick={() => addVariantRow(`5 ${productDraft.unit || 'kg'} bulk`, '')}>
                            <FiPlus /> 5{productDraft.unit || 'kg'} Bulk
                          </button>
                          <button type="button" className="admin__ghost" onClick={() => addVariantRow(`10 ${productDraft.unit || 'kg'} bulk`, '')}>
                            <FiPlus /> 10{productDraft.unit || 'kg'} Bulk
                          </button>
                          <button type="button" className="admin__primary" onClick={() => addVariantRow('', '')}>
                            <FiPlus /> Custom Price Range
                          </button>
                        </div>
                      </div>
                    )}

                    {!productDraft.id && (
                      <div style={{ marginTop: '20px', borderTop: '2px dashed #E5E7EB', paddingTop: '16px' }}>
                        {additionalItems.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: '#F9FAFB',
                              border: '1.5px solid #D1D5DB',
                              borderRadius: '12px',
                              padding: '16px',
                              marginBottom: '16px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>
                              <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#1C4B12', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📦 Additional Sibling Item #{idx + 2}
                              </h4>
                              <button
                                type="button"
                                className="admin-danger"
                                style={{ padding: '4px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => removeAdditionalItem(idx)}
                              >
                                <FiTrash2 size={12} /> Remove Item #{idx + 2}
                              </button>
                            </div>

                            <div className="admin-form__grid">
                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Product Name *</label>
                                <input
                                  className="admin-input-box"
                                  value={item.name || ''}
                                  onChange={(e) => updateAdditionalItem(idx, 'name', e.target.value)}
                                  placeholder="e.g. Dawat Gold Basmati 5kg"
                                  required
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Target Availability *</label>
                                <select
                                  className="admin-input-box"
                                  value={item.targetType || productDraft.targetType || 'retail_and_wholesale'}
                                  onChange={(e) => updateAdditionalItem(idx, 'targetType', e.target.value)}
                                >
                                  <option value="retail_and_wholesale">Retail and Wholesale</option>
                                  <option value="retail">Retail Only</option>
                                  <option value="wholesale">Wholesale Only</option>
                                </select>
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Pack Size / Weight</label>
                                <input
                                  className="admin-input-box"
                                  value={item.weight || ''}
                                  onChange={(e) => updateAdditionalItem(idx, 'weight', e.target.value)}
                                  placeholder="e.g. 500, 1, 5"
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Unit</label>
                                <select
                                  className="admin-input-box"
                                  value={item.unit || productDraft.unit || 'g'}
                                  onChange={(e) => updateAdditionalItem(idx, 'unit', e.target.value)}
                                >
                                  <option value="g">Grams (g)</option>
                                  <option value="kg">Kilograms (kg)</option>
                                  <option value="ml">Millilitres (ml)</option>
                                  <option value="L">Litres (L)</option>
                                  <option value="pcs">Pieces (pcs)</option>
                                </select>
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Selling Price (₹) *</label>
                                <input
                                  className="admin-input-box"
                                  type="number"
                                  value={item.price || ''}
                                  onChange={(e) => updateAdditionalItem(idx, 'price', e.target.value)}
                                  placeholder="420"
                                  required
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>MRP (₹)</label>
                                <input
                                  className="admin-input-box"
                                  type="number"
                                  value={item.mrp || ''}
                                  onChange={(e) => updateAdditionalItem(idx, 'mrp', e.target.value)}
                                  placeholder="490"
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Cost Price (₹)</label>
                                <input
                                  className="admin-input-box"
                                  type="number"
                                  value={item.costPrice || ''}
                                  onChange={(e) => updateAdditionalItem(idx, 'costPrice', e.target.value)}
                                  placeholder="330"
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Wholesale Price (₹)</label>
                                <input
                                  className="admin-input-box"
                                  type="number"
                                  value={item.wholesalePrice || ''}
                                  onChange={(e) => updateAdditionalItem(idx, 'wholesalePrice', e.target.value)}
                                  placeholder="380"
                                />
                              </div>
                            </div>

                            <div style={{ marginTop: '10px' }}>
                              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>
                                Product Image URL <span style={{ fontWeight: 400, color: '#687466' }}>(Optional — defaults to Item #1 image if left empty)</span>
                              </label>
                              <input
                                className="admin-input-box"
                                value={item.image || ''}
                                onChange={(e) => updateAdditionalItem(idx, 'image', e.target.value)}
                                placeholder="https://images.unsplash.com/..."
                              />
                              <label className="admin-file-input" style={{ marginTop: '6px' }}>
                                <span>Or choose image from device</span>
                                <input type="file" accept="image/*" onChange={(e) => handleAdditionalImageUpload(idx, e)} />
                              </label>
                            </div>

                            <div style={{ marginTop: '10px' }}>
                              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Description</label>
                              <textarea
                                className="admin-input-box"
                                style={{ height: 'auto' }}
                                rows={2}
                                value={item.description || ''}
                                onChange={(e) => updateAdditionalItem(idx, 'description', e.target.value)}
                                placeholder="Description for item..."
                              />
                            </div>

                            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                              <h4 style={{ fontSize: '12.5px', fontWeight: 700, margin: '0 0 10px', color: '#2D5016', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiLayers /> 3. Wholesale & Bulk Pricing Options
                              </h4>
                              <div className="admin-form__grid" style={{ marginBottom: '14px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Bulk Pack Label</label>
                                  <input
                                    className="admin-input-box"
                                    value={item.bulkPackLabel || ''}
                                    onChange={(e) => updateAdditionalItem(idx, 'bulkPackLabel', e.target.value)}
                                    placeholder="e.g. 5 kg bulk"
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Bulk Pack Price (₹)</label>
                                  <input
                                    className="admin-input-box"
                                    type="number"
                                    value={item.bulkPackPrice || ''}
                                    onChange={(e) => updateAdditionalItem(idx, 'bulkPackPrice', e.target.value)}
                                    placeholder="e.g. 1850"
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Wholesale Case Label</label>
                                  <input
                                    className="admin-input-box"
                                    value={item.wholesaleCaseLabel || ''}
                                    onChange={(e) => updateAdditionalItem(idx, 'wholesaleCaseLabel', e.target.value)}
                                    placeholder="e.g. 10 kg case"
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, marginBottom: '4px' }}>Wholesale Case Price (₹)</label>
                                  <input
                                    className="admin-input-box"
                                    type="number"
                                    value={item.wholesaleCasePrice || ''}
                                    onChange={(e) => updateAdditionalItem(idx, 'wholesaleCasePrice', e.target.value)}
                                    placeholder="e.g. 3600"
                                  />
                                </div>
                              </div>

                              <h4 style={{ fontSize: '12.5px', fontWeight: 700, margin: '12px 0 6px', color: '#2D5016' }}>Custom Wholesale Price Ranges / Tiers</h4>
                              {(item.variants || []).map((v, vIdx) => (
                                <div key={v.id || vIdx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                  <input
                                    className="admin-input-box"
                                    style={{ flex: 2 }}
                                    placeholder="e.g. 5 kg bulk"
                                    value={v.label || ''}
                                    onChange={(e) => updateAdditionalVariantRow(idx, vIdx, 'label', e.target.value)}
                                  />
                                  <input
                                    className="admin-input-box"
                                    style={{ flex: 1 }}
                                    type="number"
                                    placeholder="Price ₹"
                                    value={v.price || ''}
                                    onChange={(e) => updateAdditionalVariantRow(idx, vIdx, 'price', e.target.value)}
                                  />
                                  <button type="button" className="admin-danger" style={{ padding: '8px', flexShrink: 0 }} onClick={() => removeAdditionalVariantRow(idx, vIdx)}>
                                    <FiTrash2 size={12} />
                                  </button>
                                </div>
                              ))}

                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                                <button type="button" className="admin__ghost" onClick={() => addAdditionalVariantRow(idx, `${item.weight || '1'} ${item.unit || 'kg'}`, item.price)}>
                                  <FiPlus /> Base ({item.weight || '1'}{item.unit || 'kg'})
                                </button>
                                <button type="button" className="admin__ghost" onClick={() => addAdditionalVariantRow(idx, `5 ${item.unit || 'kg'} bulk`, '')}>
                                  <FiPlus /> 5{item.unit || 'kg'} Bulk
                                </button>
                                <button type="button" className="admin__ghost" onClick={() => addAdditionalVariantRow(idx, `10 ${item.unit || 'kg'} bulk`, '')}>
                                  <FiPlus /> 10{item.unit || 'kg'} Bulk
                                </button>
                                <button type="button" className="admin__primary" onClick={() => addAdditionalVariantRow(idx, '', '')}>
                                  <FiPlus /> Custom Price Range
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          className="admin__ghost"
                          onClick={addAnotherItem}
                          style={{ width: '100%', padding: '12px', justifyContent: 'center', borderStyle: 'dashed', borderColor: '#1C4B12', color: '#1C4B12', fontWeight: 700 }}
                        >
                          <FiPlus /> Add Another Item
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Status toggle card — shown when adding/editing item in Inventory Hub */}
                  {(productModalMode === 'inventory' || activeTab === 'inventory') && (
                    <div style={{
                      background: productDraft.isPublished ? '#F0FDF4' : '#FFFBEB',
                      border: `2px solid ${productDraft.isPublished ? '#86EFAC' : '#FCD34D'}`,
                      borderRadius: '12px',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexWrap: 'wrap',
                      marginBottom: '12px'
                    }}>
                      <div>
                        <strong style={{ fontSize: '13px', color: productDraft.isPublished ? '#166534' : '#92400E' }}>
                          {productDraft.isPublished ? '🟢 Upload to Website' : '🟡 Inventory Only'}
                        </strong>
                        <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#687466' }}>
                          {productDraft.isPublished
                            ? 'This item will be visible to customers on the website after saving.'
                            : "This item will be saved to inventory only. Customers won't see it yet."}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          type="button"
                          style={{
                            padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: '2px solid #86EFAC',
                            background: productDraft.isPublished ? '#16A34A' : 'transparent',
                            color: productDraft.isPublished ? '#fff' : '#16A34A',
                            cursor: 'pointer'
                          }}
                          onClick={() => setProductDraft(prev => ({ ...prev, isPublished: true }))}
                        >
                          ✅ Yes, Upload
                        </button>
                        <button
                          type="button"
                          style={{
                            padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                            border: '2px solid #FCD34D',
                            background: !productDraft.isPublished ? '#D97706' : 'transparent',
                            color: !productDraft.isPublished ? '#fff' : '#92400E',
                            cursor: 'pointer'
                          }}
                          onClick={() => setProductDraft(prev => ({ ...prev, isPublished: false }))}
                        >
                          📦 No, Keep in Inventory
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="inventory-modal__footer">
                    <button type="button" className="admin__ghost" onClick={() => setShowProductModal(false)}>Cancel</button>
                    <button type="submit" className="admin__primary" disabled={apiLoading || imageUploading}>
                      {imageUploading
                        ? 'Uploading image...'
                        : apiLoading
                        ? 'Saving...'
                        : <><FiSave /> {additionalItems.length > 0 ? `Save All (${1 + additionalItems.length}) Items` : 'Save Item'}</>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* HOME PAGE LAYOUT & SECTION VISIBILITY */}
          {activeTab === 'home-sections' && (
            <section className="admin-card admin-card--wide" style={{ padding: '24px' }}>
              <div className="admin-card__toolbar" style={{ borderBottom: '1px solid #E1E6DC', paddingBottom: '16px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#1C4B12', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiGrid /> Home Page Section Controls
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#687466' }}>
                    Control which featured sections and category rows appear on the website homepage. Sections with 0 products auto-hide automatically.
                  </p>
                </div>
                <button
                  type="button"
                  className="admin__primary"
                  style={{ padding: '8px 20px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  disabled={apiLoading}
                  onClick={saveHomeSectionSettings}
                >
                  <FiSave /> {apiLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>

              {/* Store open / closed */}
              {(() => {
                const isOpen = localHomeSections.storeOpen !== false;
                return (
                  <div style={{ marginBottom: '28px', padding: '16px 18px', borderRadius: '12px', border: `2px solid ${isOpen ? '#2D5016' : '#C0392B'}`, background: isOpen ? '#F1F8E9' : '#FDECEA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: isOpen ? '#1C4B12' : '#C0392B' }}>
                        Is the store open? — currently {isOpen ? 'OPEN' : 'CLOSED'}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#687466', marginTop: '2px' }}>
                        Choose No to show a "Store is closed" message in the homepage hero banner.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" disabled={apiLoading || isOpen} onClick={() => setStoreOpen(true)}
                        style={{ padding: '8px 22px', borderRadius: '8px', border: '1px solid #2D5016', fontWeight: 800, cursor: isOpen ? 'default' : 'pointer', background: isOpen ? '#2D5016' : '#fff', color: isOpen ? '#fff' : '#2D5016' }}>Yes</button>
                      <button type="button" disabled={apiLoading || !isOpen} onClick={() => setStoreOpen(false)}
                        style={{ padding: '8px 22px', borderRadius: '8px', border: '1px solid #C0392B', fontWeight: 800, cursor: !isOpen ? 'default' : 'pointer', background: !isOpen ? '#C0392B' : '#fff', color: !isOpen ? '#fff' : '#C0392B' }}>No</button>
                    </div>
                  </div>
                );
              })()}

              {/* Minimum Order Value Configuration */}
              <div style={{
                marginBottom: '28px',
                padding: '16px 18px',
                borderRadius: '12px',
                border: '2px solid #2D5016',
                background: '#F0FDF4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    💵 Minimum Order Value Requirement
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#374151', marginTop: '2px' }}>
                    Enforce a minimum cart subtotal required to place an order. If customer's cart is below this amount, checkout will be blocked with a message asking them to add more items. (Set to 0 to disable).
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ position: 'relative', width: '130px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#166534', fontSize: '14px' }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={minOrderValueInput}
                      onChange={(e) => setMinOrderValueInput(e.target.value)}
                      placeholder="0"
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 26px',
                        borderRadius: '8px',
                        border: '1.5px solid #86EFAC',
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#166534',
                        background: '#FFFFFF'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="admin__primary"
                    disabled={apiLoading}
                    onClick={saveMinOrderSettings}
                    style={{ padding: '8px 18px', fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    Save Minimum Order
                  </button>
                </div>
              </div>

              {/* Featured Home Sections */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 14px', color: '#2D5016', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Featured Homepage Sections
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                  {(() => {
                    const sectionRedirectMap = {
                      todaysDeals: { tab: 'bestsellers', name: "Bestsellers & Deals" },
                      bestsellers: { tab: 'bestsellers', name: "Bestsellers & Deals" },
                      dailyOffers: { tab: 'offers', name: "Promos & Coupons" },
                      festiveOffers: { tab: 'festive-offers', name: "Festive Offers" },
                      shopByCategory: { tab: 'products', name: "Product Catalog" }
                    };

                    return [
                      { key: 'todaysDeals', title: "Today's Deals", desc: 'Shows products marked as Today\'s Deal', icon: '🏷️' },
                      { key: 'bestsellers', title: 'Bestsellers', desc: 'Shows products marked as Bestseller', icon: '⭐' },
                      { key: 'dailyOffers', title: 'Daily Offers', desc: 'Curated savings spotlight banner', icon: '⚡' },
                      { key: 'festiveOffers', title: 'Festive Offers', desc: 'Seasonal festive deals spotlight banner', icon: '🎉' },
                      { key: 'shopByCategory', title: 'Shop by Category Grid', desc: 'Top category icon scroll row', icon: '📦' }
                    ].map(it => ({ ...it, title: localHomeSections.sectionMeta?.[it.key]?.title || it.title, icon: localHomeSections.sectionMeta?.[it.key]?.icon || it.icon }))
                      .filter(it => !localHomeSections.sectionMeta?.[it.key]?.removed)
                      .map(item => {
                        const isEnabled = localHomeSections[item.key] !== false;
                        const redirectTarget = sectionRedirectMap[item.key];
                        return (
                          <div
                            key={item.key}
                            style={{
                              border: isEnabled ? '1.5px solid #BBF7D0' : '1.5px solid #E5E7EB',
                              background: isEnabled ? '#F0FDF4' : '#F9FAFB',
                              borderRadius: '10px',
                              padding: '14px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                            }}
                          >
                            <div style={{ flex: 1, paddingRight: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                                <strong style={{ fontSize: '14px', color: isEnabled ? '#166534' : '#374151' }}>{item.title}</strong>
                              </div>
                              <p style={{ margin: 0, fontSize: '11.5px', color: '#6B7280' }}>{item.desc}</p>
                              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => openBuiltinEditor(item)} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>✏️ Edit</button>
                                {redirectTarget && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveTab(redirectTarget.tab);
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    title={`Redirect to ${redirectTarget.name} management page`}
                                    style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', border: '1px solid #86EFAC', background: '#FFFFFF', color: '#166534', cursor: 'pointer' }}
                                  >
                                    🔗 Go to Section
                                  </button>
                                )}
                                <button type="button" onClick={() => removeBuiltinSection(item)} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}>🗑 Remove</button>
                              </div>
                            </div>
                            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => toggleSectionKey(item.key, e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: isEnabled ? '#2D5016' : '#D1D5DB',
                                transition: '.2s', borderRadius: '24px',
                                display: 'flex', alignItems: 'center', padding: '2px'
                              }}>
                                <span style={{
                                  height: '20px', width: '20px', borderRadius: '50%', backgroundColor: 'white',
                                  transition: '.2s', transform: isEnabled ? 'translateX(20px)' : 'translateX(0px)',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                }} />
                              </span>
                            </label>
                          </div>
                        );
                      });
                  })()}
                  {(localHomeSections.customSections || []).map(sec => {
                    const on = sec.enabled !== false;
                    return (
                      <div key={sec.id} style={{ border: on ? '1.5px solid #BBF7D0' : '1.5px solid #E5E7EB', background: on ? '#F0FDF4' : '#F9FAFB', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, paddingRight: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ fontSize: '16px' }}>{sec.icon || '✨'}</span>
                            <strong style={{ fontSize: '14px', color: on ? '#166534' : '#374151' }}>{sec.title}</strong>
                          </div>
                          <p style={{ margin: 0, fontSize: '11.5px', color: '#6B7280' }}>Custom section · {(sec.productIds || []).length} product(s)</p>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => openCustomEditor(sec)} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>✏️ Edit</button>
                            <button type="button" onClick={() => removeCustomSection(sec)} style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}>🗑 Delete</button>
                          </div>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                          <input type="checkbox" checked={on} onChange={(e) => toggleCustomSection(sec.id, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                          <span style={{ position: 'absolute', inset: 0, backgroundColor: on ? '#2D5016' : '#D1D5DB', transition: '.2s', borderRadius: '24px', display: 'flex', alignItems: 'center', padding: '2px' }}>
                            <span style={{ height: '20px', width: '20px', borderRadius: '50%', backgroundColor: 'white', transition: '.2s', transform: on ? 'translateX(20px)' : 'translateX(0px)', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
                  <button type="button" className="admin__primary" style={{ padding: '8px 18px', fontSize: '13px' }} onClick={() => openCustomEditor(null)}>+ Add New Section</button>
                  {['todaysDeals', 'bestsellers', 'dailyOffers', 'festiveOffers', 'shopByCategory'].filter(k => localHomeSections.sectionMeta?.[k]?.removed).map(k => (
                    <button key={k} type="button" onClick={() => restoreBuiltinSection(k)} style={{ fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', border: '1px dashed #9CA3AF', background: '#fff', cursor: 'pointer' }}>↩ Restore "{localHomeSections.sectionMeta?.[k]?.title || k}"</button>
                  ))}
                  <span style={{ fontSize: '12px', color: '#687466' }}>Changes go live after you press <strong>Save Settings</strong>.</span>
                </div>

                {sectionEditor && (() => {
                  const sectionRedirectMap = {
                    todaysDeals: { tab: 'bestsellers', name: "Bestsellers & Deals" },
                    bestsellers: { tab: 'bestsellers', name: "Bestsellers & Deals" },
                    dailyOffers: { tab: 'offers', name: "Promos & Coupons" },
                    festiveOffers: { tab: 'festive-offers', name: "Festive Offers" },
                    shopByCategory: { tab: 'products', name: "Product Catalog" }
                  };
                  const redirectTarget = sectionEditor.key ? sectionRedirectMap[sectionEditor.key] : null;

                  return (
                    <div style={{ marginTop: '16px', padding: '18px', border: '2px solid #2D5016', borderRadius: '12px', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#1C4B12' }}>
                          {sectionEditor.mode === 'builtin' ? 'Edit section' : (sectionEditor.id ? 'Edit custom section' : 'New custom section')}
                        </h4>

                        {redirectTarget && (
                          <button
                            type="button"
                            onClick={() => {
                              setSectionEditor(null);
                              setActiveTab(redirectTarget.tab);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              padding: '6px 14px',
                              borderRadius: '8px',
                              border: '1.5px solid #2D5016',
                              background: '#F0FDF4',
                              color: '#166534',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                          >
                            🚀 Go to dedicated {redirectTarget.name} section →
                          </button>
                        )}
                      </div>

                      {redirectTarget && (
                        <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#FEF9C3', border: '1px solid #FDE047', borderRadius: '8px', fontSize: '12px', color: '#854D0E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <span>💡 <strong>Tip:</strong> This homepage section has a dedicated management tab in the Admin Dashboard (<strong>{redirectTarget.name}</strong>) to manage its items and offers.</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSectionEditor(null);
                              setActiveTab(redirectTarget.tab);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{ fontSize: '11.5px', fontWeight: 800, color: '#854D0E', background: '#FFFFFF', border: '1px solid #FACC15', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Open {redirectTarget.name} Tab
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '10px', marginBottom: '12px' }}>
                        <input className="admin-input-box" value={sectionEditor.icon} maxLength={4} onChange={(e) => setSectionEditor(p => ({ ...p, icon: e.target.value }))} placeholder="Emoji" aria-label="Section emoji" />
                        <input className="admin-input-box" value={sectionEditor.title} onChange={(e) => setSectionEditor(p => ({ ...p, title: e.target.value }))} placeholder="Section title, e.g. New Arrivals" aria-label="Section title" />
                      </div>
                      {sectionEditor.mode === 'custom' && (
                        <>
                          <input className="admin-input-box" value={sectionProductSearch} onChange={(e) => setSectionProductSearch(e.target.value)} placeholder={`Search products to show in this section (${sectionEditor.productIds.length} selected)`} style={{ marginBottom: '8px' }} />
                          <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #E1E6DC', borderRadius: '8px' }}>
                            {(allProducts || [])
                              .filter(p => !p.isArchived && (!sectionProductSearch.trim() || String(p.name || '').toLowerCase().includes(sectionProductSearch.trim().toLowerCase())))
                              .slice(0, 200)
                              .map(p => {
                                const checked = sectionEditor.productIds.includes(p.id);
                                return (
                                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderBottom: '1px solid #F1F3EE', cursor: 'pointer', background: checked ? '#F0FDF4' : '#fff' }}>
                                    <input type="checkbox" checked={checked} onChange={() => setSectionEditor(prev => ({ ...prev, productIds: checked ? prev.productIds.filter(id => id !== p.id) : [...prev.productIds, p.id] }))} />
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{p.name}</span>
                                    <span style={{ fontSize: '11.5px', color: '#687466', marginLeft: 'auto' }}>{p.category}</span>
                                  </label>
                                );
                              })}
                          </div>
                        </>
                      )}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" className="admin__primary" style={{ padding: '8px 18px', fontSize: '13px' }} onClick={saveSectionEditor}>{sectionEditor.mode === 'builtin' || sectionEditor.id ? 'Apply' : 'Add Section'}</button>
                        {redirectTarget && (
                          <button
                            type="button"
                            onClick={() => {
                              setSectionEditor(null);
                              setActiveTab(redirectTarget.tab);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: '1px solid #86EFAC', background: '#F0FDF4', color: '#166534', fontWeight: 700, cursor: 'pointer' }}
                          >
                            🔗 Go to {redirectTarget.name} Tab
                          </button>
                        )}
                        <button type="button" style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '8px', border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }} onClick={() => { setSectionEditor(null); setSectionProductSearch(''); }}>Cancel</button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Category Sections */}
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 14px', color: '#2D5016', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Homepage Category Rows
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                  {(() => {
                    const adminCatMap = new Map();
                    (siteCategories || []).forEach(cat => {
                      if (cat?.id) adminCatMap.set(String(cat.id).toLowerCase(), cat);
                    });
                    (allProducts || []).forEach(p => {
                      if (p.category) {
                        const key = String(p.category).toLowerCase();
                        if (!adminCatMap.has(key)) {
                          adminCatMap.set(key, {
                            id: p.category,
                            name: String(p.category).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                          });
                        }
                      }
                    });
                    const allAdminCats = Array.from(adminCatMap.values());

                    return allAdminCats.map(cat => {
                      const catIdLower = String(cat.id).toLowerCase();
                      const catNameLower = String(cat.name || '').toLowerCase();
                      const count = (allProducts || []).filter(p => {
                        if (!p.category) return false;
                        const pCatLower = String(p.category).toLowerCase();
                        return pCatLower === catIdLower || pCatLower === catNameLower;
                      }).length;

                      const isEnabled = localHomeSections.categories?.[cat.id] !== false && localHomeSections.categories?.[catIdLower] !== false;
                      const isAutoHidden = count === 0;

                      return (
                        <div
                          key={cat.id}
                          style={{
                            border: isEnabled ? (isAutoHidden ? '1.5px solid #FDE68A' : '1.5px solid #BBF7D0') : '1.5px solid #E5E7EB',
                            background: isEnabled ? (isAutoHidden ? '#FEFCE8' : '#F0FDF4') : '#F9FAFB',
                            borderRadius: '10px',
                            padding: '14px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                          }}
                        >
                          <div style={{ flex: 1, paddingRight: '12px' }}>
                            <strong style={{ fontSize: '14px', display: 'block', color: isEnabled ? '#166534' : '#374151' }}>{cat.name}</strong>
                            <span style={{ fontSize: '11.5px', color: count > 0 ? '#059669' : '#D97706', fontWeight: 600 }}>
                              {count > 0 ? `✓ ${count} product${count > 1 ? 's' : ''} available` : '⚠️ 0 products (Auto-hidden on site)'}
                            </span>
                          </div>
                          <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={(e) => toggleCategoryKey(cat.id, e.target.checked)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: isEnabled ? '#2D5016' : '#D1D5DB',
                              transition: '.2s', borderRadius: '24px',
                              display: 'flex', alignItems: 'center', padding: '2px'
                            }}>
                              <span style={{
                                height: '20px', width: '20px', borderRadius: '50%', backgroundColor: 'white',
                                transition: '.2s', transform: isEnabled ? 'translateX(20px)' : 'translateX(0px)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                              }} />
                            </span>
                          </label>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </section>
          )}

          {/* BESTSELLERS & TODAY'S DEALS */}
          {activeTab === 'bestsellers' && (
            <section className="admin-card admin-card--wide">
              <div className="admin-card__toolbar">
                <h2>Bestsellers & Today's Deals</h2>
                <div className="admin-search-label" style={{ width: '260px' }}>
                  <FiSearch />
                  <input
                    placeholder="Search products..."
                    value={promoTagSearch}
                    onChange={(e) => setPromoTagSearch(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allProducts
                  .filter(product => {
                    const q = promoTagSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (product.name || '').toLowerCase().includes(q) || (product.brand || '').toLowerCase().includes(q);
                  })
                  .map(product => (
                    <div key={product.id} className="admin-row admin-row--plain" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                      <img src={toWebpImage(product.image)} alt={product.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                      <div style={{ flex: 1 }}>
                        <strong>{product.name}</strong>
                        <span style={{ fontSize: 12, color: '#687466' }}>{product.brand} / {product.weight}{product.unit} / {formatPrice(product.price)}</span>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: product.isBestseller ? '#2D5016' : '#687466', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(product.isBestseller)}
                          onChange={() => toggleProductFlag(product.id, 'isBestseller', product.isBestseller, Boolean(product.wholesalePrice))}
                        />
                        Bestseller
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: product.isTodaysDeal ? '#2D5016' : '#687466', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(product.isTodaysDeal)}
                          onChange={() => toggleProductFlag(product.id, 'isTodaysDeal', product.isTodaysDeal, Boolean(product.wholesalePrice))}
                        />
                        Today's Deal
                      </label>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* BROADCAST */}
          {activeTab === 'broadcast' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-card admin-card--wide">
              <div className="admin-card__toolbar" style={{ borderBottom: '1px solid #E1E6DC', paddingBottom: '12px', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FiMail size={24} style={{ color: '#2D5016' }} />
                  <div>
                    <h2 style={{ margin: 0 }}>{broadcastChannel === 'sms' ? 'SMS Broadcast Campaign' : 'Mail Broadcast Campaign'}</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#687466' }}>
                      Send promotions, festive offers, coupon codes, or updates to registered customers.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className={broadcastChannel === 'email' ? 'admin__primary' : 'admin__ghost'}
                    style={{ fontSize: '11.5px', padding: '6px 12px' }}
                    onClick={() => { setBroadcastChannel('email'); setBroadcastStatus(null); }}
                  >
                    <FiMail size={12} /> Email
                  </button>
                  <button
                    type="button"
                    className={broadcastChannel === 'sms' ? 'admin__primary' : 'admin__ghost'}
                    style={{ fontSize: '11.5px', padding: '6px 12px' }}
                    onClick={() => { setBroadcastChannel('sms'); setBroadcastStatus(null); }}
                  >
                    <FiPhone size={12} /> SMS
                  </button>
                </div>
              </div>

              {broadcastStatus && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  background: broadcastStatus.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                  color: broadcastStatus.type === 'success' ? '#065F46' : '#991B1B'
                }}>
                  {broadcastStatus.msg}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Recipients</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All Customers', icon: '👥' },
                    { id: 'VIP', label: 'VIP / High-Value', icon: '🌟' },
                    { id: 'Returning', label: 'Returning', icon: '🔁' },
                    { id: 'New', label: 'New', icon: '🌱' },
                    { id: 'Inactive', label: 'Inactive (30d+)', icon: '💤' }
                  ].map(seg => {
                    const count = seg.id === 'all'
                      ? (liveCustomers || []).length
                      : (liveCustomers || []).filter(c => c.segment === seg.id).length;
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        className={`inventory-filter-btn ${broadcastSegment === seg.id ? 'inventory-filter-btn--active' : ''}`}
                        onClick={() => selectBroadcastSegment(seg.id)}
                      >
                        {seg.icon} {seg.label} <span className="inventory-badge-count">{count}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="admin__ghost"
                    style={{ fontSize: '11.5px', padding: '6px 12px' }}
                    onClick={() => setActiveTab('customers')}
                  >
                    Choose individual customers →
                  </button>
                </div>
              </div>

              {selectedBroadcastEmails.length > 0 && (
                <p style={{ fontSize: '11.5px', color: '#687466', margin: '0 0 12px' }}>
                  Sending to: <strong>{selectedBroadcastEmails.length === 1 ? selectedBroadcastEmails[0] : `${selectedBroadcastEmails.length} customers`}</strong>
                </p>
              )}

              <form onSubmit={async (e) => {
                e.preventDefault();
                const isSms = broadcastChannel === 'sms';
                if (!broadcastMessage.trim() || (!isSms && !broadcastSubject.trim())) {
                  setBroadcastStatus({ type: 'error', msg: isSms ? 'Please write a message before sending.' : 'Please fill in both the subject and message body before sending.' });
                  return;
                }
                if (selectedBroadcastEmails.length === 0) {
                  setBroadcastStatus({ type: 'error', msg: 'No recipients selected — nothing to send.' });
                  return;
                }
                setBroadcastSending(true);
                setBroadcastStatus(null);
                try {
                  const res = await adminApi.sendBroadcast({
                    channel: broadcastChannel,
                    subject: broadcastSubject,
                    messageText: broadcastMessage,
                    recipients: selectedBroadcastEmails
                  });
                  setBroadcastStatus({
                    type: 'success',
                    msg: isSms
                      ? `SMS sent successfully to ${res.count} customer(s) with a phone number on file.`
                      : `Campaign sent successfully to ${res.count} customer(s). Ask them to check their spam/promotions folder if it doesn't show up in the inbox.`
                  });
                  setBroadcastSubject('');
                  setBroadcastMessage('');
                } catch (err) {
                  setBroadcastStatus({ type: 'error', msg: err.message || `Failed to send ${isSms ? 'SMS' : 'mail'} broadcast.` });
                } finally {
                  setBroadcastSending(false);
                }
              }}>
                {broadcastChannel !== 'sms' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Email Subject</label>
                    <input
                      type="text"
                      required
                      className="admin-input-box"
                      placeholder="e.g. Special Offer: 10% Off on All Grocery Items!"
                      value={broadcastSubject}
                      onChange={(e) => setBroadcastSubject(e.target.value)}
                    />
                  </div>
                )}
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Message Body</label>
                  <textarea
                    required
                    rows={6}
                    className="admin-input-box"
                    style={{ height: 'auto', padding: '10px 12px' }}
                    placeholder={broadcastChannel === 'sms' ? 'e.g. Use code FEST20 for 20% off till Sunday' : ''}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                  />
                </div>
                {broadcastChannel === 'sms' && (() => {
                  const wrapped = `Dear Customer, ${broadcastMessage}. Shop now: siritrader.com. T&C apply.`;
                  return (
                    <div style={{ margin: '0 0 16px' }}>
                      <p style={{ fontSize: '11px', color: '#687466', margin: '0 0 4px' }}>
                        Sent as: <em>"{wrapped}"</em>
                      </p>
                      <p style={{ fontSize: '11px', color: wrapped.length > 160 ? '#B45309' : '#687466', margin: 0 }}>
                        {wrapped.length} characters {wrapped.length > 160 ? `(sent as ${Math.ceil(wrapped.length / 153)} SMS segments)` : '(fits in 1 SMS segment)'}
                      </p>
                    </div>
                  );
                })()}
                <button type="submit" disabled={broadcastSending} className="admin__primary" style={{ width: '100%', marginTop: broadcastChannel === 'sms' ? 0 : '12px' }}>
                  {broadcastSending ? 'Sending Campaign...' : broadcastChannel === 'sms' ? '🚀 Send Broadcast SMS' : '🚀 Send Broadcast Email'}
                </button>
              </form>
              </div>
            </div>
          )}

          {/* ADMIN ACCOUNTS */}
          {activeTab === 'admins' && (
            <section className="admin-grid">
              <form className="admin-form" onSubmit={saveAdmin}>
                <h2>Add admin user</h2>
                <input value={adminDraft.name} onChange={(e) => setAdminDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Full name" required />
                <input value={adminDraft.email} onChange={(e) => setAdminDraft(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" type="email" required />
                <input value={adminDraft.password} onChange={(e) => setAdminDraft(prev => ({ ...prev, password: e.target.value }))} placeholder="Password (min 8 chars)" type="password" minLength={8} required />
                <select value={adminDraft.role} onChange={(e) => setAdminDraft(prev => ({ ...prev, role: e.target.value }))}>
                  <option value="Owner">Owner</option>
                  <option value="Super Admin">Super Admin</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="Order Manager">Order Manager</option>
                  <option value="Marketing Manager">Marketing Manager</option>
                  <option value="Content Manager">Content Manager</option>
                  <option value="Customer Support">Customer Support</option>
                  <option value="Viewer">Viewer</option>
                </select>
                {adminError && <p style={{ color: '#FF6B35', fontSize: 13, fontWeight: 700 }}>{adminError}</p>}
                <button type="submit" className="admin__primary"><FiPlus /> Add admin</button>
              </form>
              <div className="admin-card">
                <h2>Admin accounts ({adminAccounts.length})</h2>
                {adminAccounts.map(account => {
                  const isSelf = account.email === adminSession?.email;
                  return (
                    <div key={account.id} className="admin-row admin-row--plain">
                      <FiLock />
                      <span>{account.name}<small>{account.email}</small></span>
                      <select
                        className="admin-segment-select"
                        value={account.role}
                        disabled={isSelf}
                        title={isSelf ? "You can't change your own role" : 'Change role'}
                        onChange={(e) => updateAdminRole(account, e.target.value)}
                      >
                        <option value="Owner">Owner</option>
                        <option value="Super Admin">Super Admin</option>
                        <option value="Product Manager">Product Manager</option>
                        <option value="Order Manager">Order Manager</option>
                        <option value="Marketing Manager">Marketing Manager</option>
                        <option value="Content Manager">Content Manager</option>
                        <option value="Customer Support">Customer Support</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="admin__ghost admin-row-action-btn"
                          style={{ padding: '6px 10px', fontSize: '11.5px' }}
                          onClick={() => resetAdminPassword(account)}
                        >
                          <FiLock size={12} /> Reset Password
                        </button>
                        {isSelf ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#687466' }}>You</span>
                        ) : (
                          <button
                            type="button"
                            className="admin-danger admin-row-action-btn"
                            style={{ padding: '6px 10px', fontSize: '11.5px' }}
                            onClick={async () => {
                              if (window.confirm(`Remove admin access for ${account.name} (${account.email})?`)) {
                                try {
                                  await adminApi.deleteAdminUser(account.id);
                                  setAdminAccounts(prev => prev.filter(a => a.id !== account.id));
                                } catch (err) { alert(err.message); }
                              }
                            }}
                          >
                            <FiTrash2 size={12} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="admin-grid">
              <div className="admin-card">
                <h2><FiShield style={{ verticalAlign: 'middle', marginRight: '6px' }} />Account</h2>
                <div className="admin-row admin-row--plain">
                  <FiUsers />
                  <span>{adminSession?.name}<small>{adminSession?.email}</small></span>
                  <span className="admin-segment-pill">{adminSession?.role}</span>
                </div>
              </div>

              <form className="admin-form" onSubmit={changeOwnPassword}>
                <h2><FiLock style={{ verticalAlign: 'middle', marginRight: '6px' }} />Change Password</h2>
                <div style={{ position: 'relative' }}>
                  <input
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Current password"
                    type={showPasswordFields ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <input
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="New password (min 8 chars)"
                  type={showPasswordFields ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <input
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                  type={showPasswordFields ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#687466', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showPasswordFields} onChange={(e) => setShowPasswordFields(e.target.checked)} />
                  {showPasswordFields ? <FiEyeOff size={13} /> : <FiEye size={13} />} Show passwords
                </label>
                {passwordChangeStatus && (
                  <p style={{ color: passwordChangeStatus.type === 'success' ? '#2D5016' : '#FF6B35', fontSize: 13, fontWeight: 700 }}>
                    {passwordChangeStatus.msg}
                  </p>
                )}
                <button type="submit" className="admin__primary" disabled={passwordChangeLoading}>
                  <FiSave /> {passwordChangeLoading ? 'Saving…' : 'Update Password'}
                </button>
              </form>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default Admin;
