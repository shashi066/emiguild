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

  // ── Sample Games ──────────────────────────────────────────────
  const games = [
    // Single-Player Adventures
    { name: 'Black Myth: Wukong', category: 'Single-Player Adventures', position: 1 },
    { name: 'God of War Ragnarök', category: 'Single-Player Adventures', position: 2 },
    { name: "Ghost of Tsushima Director's Cut", category: 'Single-Player Adventures', position: 3 },
    { name: "Marvel's Spider-Man: Miles Morales", category: 'Single-Player Adventures', position: 4 },
    { name: 'Horizon Forbidden West', category: 'Single-Player Adventures', position: 5 },
    { name: 'Red Dead Redemption 2', category: 'Single-Player Adventures', position: 6 },
    { name: 'The Witcher 3: Wild Hunt', category: 'Single-Player Adventures', position: 7 },
    { name: 'Hogwarts Legacy', category: 'Single-Player Adventures', position: 8 },
    { name: 'Final Fantasy XVI', category: 'Single-Player Adventures', position: 9 },
    { name: 'Final Fantasy VII Rebirth', category: 'Single-Player Adventures', position: 10 },
    { name: 'Death Stranding Director\'s Cut', category: 'Single-Player Adventures', position: 11 },
    { name: 'Ratchet & Clank: Rift Apart', category: 'Single-Player Adventures', position: 12 },
    { name: "Assassin's Creed Valhalla", category: 'Single-Player Adventures', position: 13 },
    { name: "Assassin's Creed Mirage", category: 'Single-Player Adventures', position: 14 },
    { name: 'Uncharted: Legacy of Thieves Collection', category: 'Single-Player Adventures', position: 15 },
    { name: 'Mafia Trilogy', category: 'Single-Player Adventures', position: 16 },
    { name: 'Resident Evil 4 Remake', category: 'Single-Player Adventures', position: 17 },
    { name: 'Resident Evil Village', category: 'Single-Player Adventures', position: 18 },
    { name: 'Days Gone', category: 'Single-Player Adventures', position: 19 },
    { name: 'Alan Wake 2', category: 'Single-Player Adventures', position: 20 },
    { name: 'Dead Space Remake', category: 'Single-Player Adventures', position: 21 },
    { name: 'The Callisto Protocol', category: 'Single-Player Adventures', position: 22 },

    // Multiplayer, Co-op & Competitive
    { name: 'EA Sports FC 26', category: 'Multiplayer, Co-op & Competitive', position: 1 },
    { name: 'Cricket 24', category: 'Multiplayer, Co-op & Competitive', position: 2 },
    { name: 'WWE 2K26', category: 'Multiplayer, Co-op & Competitive', position: 3 },
    { name: 'NBA 2K26', category: 'Multiplayer, Co-op & Competitive', position: 4 },
    { name: 'GTA V Online', category: 'Multiplayer, Co-op & Competitive', position: 5 },
    { name: 'Call of Duty: Black Ops III', category: 'Multiplayer, Co-op & Competitive', position: 6 },
    { name: 'Call of Duty: Black Ops 6', category: 'Multiplayer, Co-op & Competitive', position: 7 },
    { name: 'Tekken 8', category: 'Multiplayer, Co-op & Competitive', position: 8 },
    { name: 'Mortal Kombat 1', category: 'Multiplayer, Co-op & Competitive', position: 9 },
    { name: 'Mortal Kombat 11', category: 'Multiplayer, Co-op & Competitive', position: 10 },
    { name: 'Injustice 2', category: 'Multiplayer, Co-op & Competitive', position: 11 },
    { name: 'Street Fighter 6', category: 'Multiplayer, Co-op & Competitive', position: 12 },
    { name: 'Rainbow Six Siege', category: 'Multiplayer, Co-op & Competitive', position: 13 },
    { name: 'Helldivers 2', category: 'Multiplayer, Co-op & Competitive', position: 14 },
    { name: 'Destiny 2', category: 'Multiplayer, Co-op & Competitive', position: 15 },
    { name: 'Overwatch 2', category: 'Multiplayer, Co-op & Competitive', position: 16 },
    { name: 'Evil Dead: The Game', category: 'Multiplayer, Co-op & Competitive', position: 17 },
    { name: 'It Takes Two', category: 'Multiplayer, Co-op & Competitive', position: 18 },
    { name: 'A Way Out', category: 'Multiplayer, Co-op & Competitive', position: 19 },
    { name: 'Overcooked! All You Can Eat', category: 'Multiplayer, Co-op & Competitive', position: 20 },
    { name: 'Sackboy: A Big Adventure', category: 'Multiplayer, Co-op & Competitive', position: 21 },

    // Racing & Simulator Experience
    { name: 'F1 25', category: 'Racing & Simulator Experience', position: 1 },
    { name: 'Gran Turismo 7', category: 'Racing & Simulator Experience', position: 2 },
    { name: 'Forza Horizon 5', category: 'Racing & Simulator Experience', position: 3 },
    { name: 'The Crew Motorfest', category: 'Racing & Simulator Experience', position: 4 },
    { name: 'Need for Speed Unbound', category: 'Racing & Simulator Experience', position: 5 },
  ];

  const existingGames = await prisma.game.count();
  if (existingGames === 0) {
    await prisma.game.createMany({ data: games });
    console.log('✅ Sample games created');
  } else {
    console.log(`✅ Games already exist (${existingGames} found)`);
  }

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
