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

  // ── Sample Draw (Admin-managed weekly draw) ─────────────────
  const drawTitle = 'EMI Guild Weekly Draw #1';
  const existingDraw = await prisma.draw.findFirst({ where: { title: drawTitle, isDeleted: false } });
  let draw;
  if (!existingDraw) {
    draw = await prisma.draw.create({
      data: {
        title: drawTitle,
        description: 'Weekly giveaway for EMI Guild members',
        prizeName: 'Bronze Pass',
        startAt: new Date(),
        endAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days from now
        status: 'ACTIVE',
      },
    });
    console.log(`✅ Sample draw created: ${drawTitle}`);
  } else {
    draw = existingDraw;
    console.log(`✅ Draw already exists: ${drawTitle}`);
  }

  // ── Sample participants for the draw ───────────────────────
  // Create two sample users and create entries if not present
  const sampleUsers = [
    { email: 'alice@example.com', name: 'Alice', password: 'Test@123', phone: '9876543210' },
    { email: 'bob@example.com',   name: 'Bob',   password: 'Test@123', phone: '9123456789' },
  ];

  for (const u of sampleUsers) {
    const hashedPwd = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        password: hashedPwd,
        phone: u.phone,
      },
    });

    // create draw entry if not exists
    const existingEntry = await prisma.drawEntry.findFirst({ where: { drawId: draw.id, userId: user.id } });
    if (!existingEntry) {
      await prisma.drawEntry.create({ data: { drawId: draw.id, userId: user.id, phone: user.phone } });
    }
  }

  console.log('✅ Sample draw participants ensured');

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
