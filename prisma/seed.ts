import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Default Settings ──────────────────────────────────────────
  await prisma.setting.upsert({
    where:  { key: 'controller_price' },
    update: {},
    create: { key: 'controller_price', value: '30', label: 'Extra Controller Price (per controller, per booking)' },
  });
  
  await prisma.setting.upsert({
    where: { key: 'daily_spin_enabled' },
    update: {},
    create: { key: 'daily_spin_enabled', value: 'true', label: 'Enable Daily Spin Feature' },
  });

  await prisma.setting.upsert({
    where: { key: 'daily_spin_retries_enabled' },
    update: {},
    create: { key: 'daily_spin_retries_enabled', value: 'false', label: 'Allow Retries for Daily Spin' },
  });

  await prisma.setting.upsert({
    where: { key: 'daily_spin_max_retries' },
    update: {},
    create: { key: 'daily_spin_max_retries', value: '1', label: 'Maximum Retries for Daily Spin' },
  });

  await prisma.setting.upsert({
    where: { key: 'daily_spin_reset_hour' },
    update: {},
    create: { key: 'daily_spin_reset_hour', value: '0', label: 'Daily Reset Hour in IST (0-23)' },
  });
  console.log('✅ Settings seeded');

  // ── Admin User ────────────────────────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL    ?? 'admin@gamezone.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@123';
  const hashed = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where:  { email: adminEmail },
    update: {},
    create: {
      email:    adminEmail,
      name:     'Admin',
      password: hashed,
      role:     'ADMIN',
    },
  });
  console.log(`✅ Admin user: ${adminEmail}`);

  // ── Sample Stations ───────────────────────────────────────────
  const stations = [
    { name: 'Alpha Station', description: 'High-performance PC for competitive gaming', specs: 'RTX 4080 · i9-13900K · 32GB RAM · 240Hz 1440p', hourlyRate: 150, position: 1 },
    { name: 'Beta Station',  description: 'Mid-range PC perfect for casual gaming',     specs: 'RTX 3070 · i7-12700 · 16GB RAM · 144Hz 1080p',  hourlyRate: 100, position: 2 },
    { name: 'Console Zone',  description: 'PS5 + Xbox Series X dual console setup',     specs: 'PS5 + Xbox Series X · 65" 4K OLED · Surround',  hourlyRate: 120, position: 3 },
  ];

  for (const s of stations) {
    await prisma.station.upsert({
      where:  { id: s.name },  // won't match, will always create
      update: {},
      create: s,
    }).catch(() => {
      // Already exists — skip
    });
  }

  // Use findFirst to avoid duplicates on re-seed
  const existing = await prisma.station.count();
  if (existing === 0) {
    await prisma.station.createMany({ data: stations });
    console.log('✅ Sample stations created');
  } else {
    console.log(`✅ Stations already exist (${existing} found)`);
  }

  // ── Sample Loot Items ─────────────────────────────────────────
  const lootItems = [
    { name: '5% Discount', description: 'Get 5% off your next booking.', weight: 40, rarity: 'COMMON' },
    { name: '10% Discount', description: 'Get 10% off your next booking.', weight: 20, rarity: 'UNCOMMON' },
    { name: 'Extra XP', description: 'Double XP on your profile for 24h.', weight: 15, rarity: 'UNCOMMON' },
    { name: 'Free Drink', description: 'Redeem for one free beverage.', weight: 10, rarity: 'RARE' },
    { name: 'Bronze Pass', description: '10 hours of premium gaming.', weight: 5, rarity: 'EPIC' },
    { name: 'Gold Pass', description: '30 hours of premium gaming.', weight: 1, rarity: 'LEGENDARY' },
  ];

  for (const item of lootItems) {
    await prisma.lootItem.upsert({
      where: { id: item.name }, // Hack for idempotent seed without a unique name field. Better to use a findFirst check.
      update: {},
      create: item,
    }).catch(async () => {
        // Fallback if ID is generated and we want to check by name
        const existingItem = await prisma.lootItem.findFirst({ where: { name: item.name }});
        if (!existingItem) {
            await prisma.lootItem.create({ data: item });
        }
    });
  }
  console.log('✅ Sample loot items created/checked');

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
