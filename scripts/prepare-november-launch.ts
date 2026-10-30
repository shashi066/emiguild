import { readHappySettings, writeHappySettings } from '../lib/happy-config';
import { prisma } from '../lib/prisma';
import { DEFAULT_HAPPY_CONFIG } from '../lib/happy-ticket-rules';
import { audit, NOVEMBER_FLAGS, requireCurrentUser, rewardTransaction } from '../lib/november';

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter(a => a.includes('=')).map(a => { const [key, ...value] = a.replace(/^--/, '').split('='); return [key, value.join('=')]; }));
  const adminId = args.admin;
  const stationIds = [...new Set((args.stations ?? '').split(',').filter(Boolean))];
  if (!adminId || !stationIds.length) throw new Error('Provide --admin=EXISTING_ADMIN_ID --stations=EXPLICIT_PS5_IDS. Load the intended database URL explicitly.');
  const result = await rewardTransaction(async tx => {
    await requireCurrentUser(adminId, tx, true);
    const legendary = await tx.lootItem.count({ where: { enabled: true, weight: { gt: 0 }, rarity: 'LEGENDARY' } });
    if (!legendary) throw new Error('Configure a positive-weight Legendary reward before launch.');
    const stations = await tx.station.count({ where: { id: { in: stationIds }, isActive: true, hasControllers: true } });
    if (stations !== stationIds.length) throw new Error('All selected stations must be active PS5 stations.');
    const pool = await readHappySettings(tx);
    if (process.argv.includes('--check-only')) return { checked: true, personalCapacity: 5, selectedStations: stations, legendaryRewards: legendary };
    // Preserve existing balance, tickets, cooldowns, and operator-edited schedules.
    if (!pool.config.stationIds.length) await writeHappySettings(tx, { ...DEFAULT_HAPPY_CONFIG, stationIds }, pool.version);
    for (const key of NOVEMBER_FLAGS) await tx.setting.upsert({ where: { key }, create: { key, value: 'true' }, update: { value: 'true' } });
    await tx.setting.upsert({ where: { key: 'legendary_pity_launched_at' }, create: { key: 'legendary_pity_launched_at', value: new Date().toISOString() }, update: {} });
    await audit(tx, adminId, 'JOINT_LAUNCH', 'november-2026', null, { stationIds, flags: NOVEMBER_FLAGS });
    return { enabled: true, selectedStations: stations, legendaryRewards: legendary };
  });
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Launch preparation failed.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
