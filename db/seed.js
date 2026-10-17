import * as dotenv from 'dotenv';
import { pathToFileURL } from 'url';
import { db, configureDbForNode, categories, products, offers, coupons, deliveryZones } from './index.js';

// Load Dummy Data
import { categories as dummyCategories } from '../frontend/src/data/categories.js';
import { baseProducts as dummyProducts } from '../frontend/src/data/products.js';
import { baseDailyOffers, baseFestivalOffers } from '../frontend/src/data/offers.js';

const dummyCoupons = [
  { id: '1', code: 'WELCOME50', discount: 50, limit: 100, active: true },
  { id: '2', code: 'FREEDEL', discount: 40, limit: 500, active: true },
  { id: '3', code: 'FESTIVAL100', discount: 100, limit: 50, active: true }
];

const dummyDeliveryZones = [
  { id: 'zone-1', area: 'Isnapur', pincode: '502307', time: '15-30 mins', distance: '0-3 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 299, handlingCharge: 5, minOrderValue: 100 },
  { id: 'zone-2', area: 'Chitkul', pincode: '502307', time: '15-30 mins', distance: '0-3 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 299, handlingCharge: 5, minOrderValue: 100 },
  { id: 'zone-3', area: 'Muttangi', pincode: '502307', time: '20-35 mins', distance: '2-5 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 5, minOrderValue: 150 },
  { id: 'zone-4', area: 'Rudraram', pincode: '502307', time: '25-40 mins', distance: '3-6 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 5, minOrderValue: 150 },
  { id: 'zone-5', area: 'Indrakaran', pincode: '502307', time: '25-40 mins', distance: '4-7 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 499, handlingCharge: 5, minOrderValue: 200 },
  { id: 'zone-6', area: 'Lakdaram', pincode: '502307', time: '30-45 mins', distance: '5-8 km', active: true, deliveryFee: 25, freeDeliveryThreshold: 499, handlingCharge: 5, minOrderValue: 200 },
  { id: 'zone-7', area: 'Bachuguda', pincode: '502307', time: '20-35 mins', distance: '2-4 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 5, minOrderValue: 150 },
  { id: 'zone-8', area: 'Indresham', pincode: '502334', time: '25-40 mins', distance: '3-6 km', active: true, deliveryFee: 0, freeDeliveryThreshold: 399, handlingCharge: 5, minOrderValue: 150 },
  { id: 'zone-9', area: 'Pocharam', pincode: '502307', time: '30-45 mins', distance: '5-8 km', active: true, deliveryFee: 25, freeDeliveryThreshold: 499, handlingCharge: 5, minOrderValue: 200 },
  { id: 'zone-10', area: 'Patancheru', pincode: '502319', time: '30-45 mins', distance: '6-9 km', active: true, deliveryFee: 25, freeDeliveryThreshold: 499, handlingCharge: 5, minOrderValue: 200 },
  { id: 'zone-11', area: 'Beeramguda', pincode: '502032', time: '35-50 mins', distance: '8-12 km', active: true, deliveryFee: 30, freeDeliveryThreshold: 599, handlingCharge: 5, minOrderValue: 250 },
  { id: 'zone-12', area: 'Ameenpur', pincode: '502032', time: '35-50 mins', distance: '9-13 km', active: true, deliveryFee: 30, freeDeliveryThreshold: 599, handlingCharge: 5, minOrderValue: 250 },
  { id: 'zone-13', area: 'Ramachandrapuram (RC Puram)', pincode: '502032', time: '40-55 mins', distance: '10-14 km', active: true, deliveryFee: 35, freeDeliveryThreshold: 699, handlingCharge: 5, minOrderValue: 300 },
  { id: 'zone-14', area: 'Kandi / Sangareddy', pincode: '502285', time: '45-60 mins', distance: '12-16 km', active: true, deliveryFee: 40, freeDeliveryThreshold: 799, handlingCharge: 5, minOrderValue: 350 }
];

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

export async function seedDatabase() {
  console.log('Seeding Categories...');
  for (const cat of dummyCategories) {
    await db.insert(categories).values({
      id: cat.id,
      name: cat.name,
      image: cat.image,
      color: cat.color,
      itemCount: cat.itemCount || 0
    }).onConflictDoNothing();
  }
  console.log(`Seeded ${dummyCategories.length} categories.`);

  console.log('Seeding Products...');
  for (const prod of dummyProducts) {
    await db.insert(products).values({
      id: prod.id,
      name: prod.name,
      brand: prod.brand || '',
      category: prod.category || '',
      description: prod.description || '',
      price: prod.price,
      mrp: prod.mrp,
      discount: prod.discount,
      weight: prod.weight,
      unit: prod.unit,
      image: prod.image,
      bestseller: prod.bestseller || false,
      inStock: prod.inStock !== false,
      wholesalePrice: prod.wholesalePrice,
      wholesaleMinQty: prod.wholesaleMinQty
    }).onConflictDoNothing();
  }
  console.log(`Seeded ${dummyProducts.length} products.`);

  console.log('Seeding Offers...');
  const allOffers = [
    ...baseDailyOffers.map(o => ({ ...o, groupType: 'daily' })),
    ...baseFestivalOffers.map(o => ({ ...o, groupType: 'festival' }))
  ];
  for (const offer of allOffers) {
    await db.insert(offers).values({
      id: offer.id,
      title: offer.title,
      subtitle: offer.subtitle || '',
      price: offer.price,
      mrp: offer.mrp,
      badge: offer.badge || '',
      image: offer.image || '',
      link: offer.link || '',
      groupType: offer.groupType,
      active: true
    }).onConflictDoNothing();
  }
  console.log(`Seeded ${allOffers.length} offers.`);

  console.log('Seeding Coupons...');
  for (const coupon of dummyCoupons) {
    await db.insert(coupons).values(coupon).onConflictDoNothing();
  }
  console.log(`Seeded ${dummyCoupons.length} coupons.`);

  console.log('Seeding Delivery Zones...');
  for (const zone of dummyDeliveryZones) {
    await db.insert(deliveryZones).values(zone).onConflictDoNothing();
  }
  console.log(`Seeded ${dummyDeliveryZones.length} delivery zones.`);

  console.log('Seed completed successfully!');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  configureDbForNode()
    .then(() => seedDatabase())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
