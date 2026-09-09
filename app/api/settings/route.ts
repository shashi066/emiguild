import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint — returns settings as a flat key:value map
// Used by the booking page to fetch controller price
export async function GET() {
  const settings = await prisma.setting.findMany({
    where: { key: { notIn: ['watch_party_economy_version', 'tower_rewards', 'tower_defaults_version', 'tower_run_duration_seconds', 'tower_red_cards_per_floor', 'guess_36_enabled', 'guess_36_rewards', 'guess_36_modes', 'emic_rewards_catalog'] } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json(map);
}
