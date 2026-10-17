-- Siri Traders — full schema for a fresh Supabase project.
-- Run this once in the new project's SQL Editor (Project: hwssutntkdqswyudeqtz).
-- Order respects foreign key dependencies (categories/orders before the
-- tables that reference them).

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT,
  color TEXT,
  item_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(id),
  subcategory TEXT,
  brand TEXT,
  sku TEXT,
  barcode TEXT,
  weight TEXT,
  unit TEXT,
  pack_size TEXT,
  price INTEGER NOT NULL,
  mrp INTEGER,
  cost_price INTEGER DEFAULT 0,
  discount INTEGER,
  gst_rate INTEGER DEFAULT 0,
  hsn_code TEXT,
  batch_number TEXT,
  mfg_date TEXT,
  expiry_date TEXT,
  image TEXT,
  description TEXT,
  in_stock BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  delivery_time TEXT DEFAULT '15 mins',
  is_bestseller BOOLEAN DEFAULT false,
  is_todays_deal BOOLEAN DEFAULT false,
  wholesale_price INTEGER,
  bulk_pack_label TEXT,
  bulk_pack_price INTEGER,
  wholesale_case_label TEXT,
  wholesale_case_price INTEGER,
  target_type TEXT DEFAULT 'retail_and_wholesale',
  variants JSONB,
  sibling_group TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  subtotal INTEGER DEFAULT 0,
  delivery_fee INTEGER DEFAULT 0,
  handling_charge INTEGER DEFAULT 0,
  coupon_code TEXT,
  discount INTEGER DEFAULT 0,
  gst_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  delivery_address TEXT,
  payment_method TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  payment_status TEXT DEFAULT 'Pending',
  payment_txn_id TEXT,
  payment_gateway TEXT DEFAULT 'Cash on Delivery',
  refund_amount INTEGER DEFAULT 0,
  refund_reason TEXT,
  refunded_at TIMESTAMP,
  order_notes TEXT,
  delivery_slot TEXT,
  delivery_date TEXT,
  tracking_number TEXT,
  delivery_partner TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMP,
  return_status TEXT DEFAULT 'None',
  return_reason TEXT,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,
  weight TEXT,
  unit TEXT,
  gst_rate INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  segment_override TEXT,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  price INTEGER NOT NULL,
  mrp INTEGER NOT NULL,
  badge TEXT,
  image TEXT,
  link TEXT,
  group_type TEXT DEFAULT 'daily',
  type TEXT DEFAULT 'Sale offer',
  buy_qty INTEGER DEFAULT 1,
  get_qty INTEGER DEFAULT 1,
  target_category TEXT,
  items_included TEXT,
  combo_items TEXT,
  start_date TEXT,
  end_date TEXT,
  usage_limit INTEGER,
  times_claimed INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount INTEGER,
  "limit" INTEGER,
  type TEXT NOT NULL DEFAULT 'flat',
  value INTEGER NOT NULL DEFAULT 0,
  min_order INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  buy_quantity INTEGER DEFAULT 1,
  get_quantity INTEGER DEFAULT 1,
  target_type TEXT DEFAULT 'all',
  target_category TEXT,
  target_product_id INTEGER,
  target_customer_email TEXT,
  usage_limit INTEGER,
  per_user_limit INTEGER DEFAULT 1,
  times_used INTEGER DEFAULT 0,
  total_discount_given INTEGER DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  title TEXT,
  description TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail',
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL,
  pincode TEXT NOT NULL,
  time TEXT NOT NULL,
  distance TEXT,
  active BOOLEAN DEFAULT true,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  free_delivery_threshold INTEGER NOT NULL DEFAULT 0,
  handling_charge INTEGER NOT NULL DEFAULT 0,
  min_order_value INTEGER DEFAULT 0,
  delivery_slots JSONB DEFAULT '[]',
  driver_assigned TEXT
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Manager',
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  delivery_fee INTEGER NOT NULL DEFAULT 25,
  free_delivery_threshold INTEGER NOT NULL DEFAULT 500,
  handling_charge INTEGER NOT NULL DEFAULT 5,
  min_order_value INTEGER NOT NULL DEFAULT 0,
  announcement_text TEXT,
  announcement_bg TEXT DEFAULT '#1C4B12',
  announcement_color TEXT DEFAULT '#FFFFFF',
  announcement_link TEXT DEFAULT '/categories',
  announcement_active BOOLEAN DEFAULT true,
  meta_title TEXT,
  meta_description TEXT,
  canonical_url TEXT DEFAULT 'https://www.siritrader.com',
  og_image TEXT,
  robots_index BOOLEAN DEFAULT true,
  google_site_verification TEXT,
  schema_json TEXT,
  sitemap_enabled BOOLEAN DEFAULT true,
  header_menu JSONB,
  footer_menu JSONB,
  home_sections JSONB
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  available_stock INTEGER NOT NULL DEFAULT 0,
  reserved_stock INTEGER NOT NULL DEFAULT 0,
  damaged_stock INTEGER NOT NULL DEFAULT 0,
  returned_stock INTEGER NOT NULL DEFAULT 0,
  expired_stock INTEGER NOT NULL DEFAULT 0,
  incoming_stock INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  cost_price INTEGER NOT NULL DEFAULT 0,
  expiry_date TEXT,
  batch_number TEXT,
  location TEXT DEFAULT 'Main Shelf',
  updated_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  change_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  batch_number TEXT,
  admin_name TEXT DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER,
  order_item_id INTEGER,
  product_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  comment TEXT,
  status TEXT DEFAULT 'Approved',
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_banners (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  image TEXT NOT NULL,
  mobile_image TEXT,
  cta_text TEXT DEFAULT 'Shop Now',
  cta_link TEXT DEFAULT '/categories',
  type TEXT DEFAULT 'hero',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS cms_pages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  meta_title TEXT,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS cms_blogs (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  author TEXT DEFAULT 'Siri Traders Editorial',
  category TEXT DEFAULT 'Grocery Tips',
  cover_image TEXT,
  tags TEXT,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS seo_redirects (
  id SERIAL PRIMARY KEY,
  source_path TEXT NOT NULL UNIQUE,
  target_path TEXT NOT NULL,
  status_code INTEGER DEFAULT 301,
  hits INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true
);

NOTIFY pgrst, 'reload schema';
