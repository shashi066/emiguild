import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint — returns settings as a flat key:value map
// Used by the booking page to fetch controller price
export async function GET() {
  const settings = await prisma.setting.findMany({
    where: { key: { not: 'watch_party_economy_version' } },
  });
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json(map);
}
