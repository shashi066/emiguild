import { MESSAGING_SETTING_KEYS, RETIRED_SPIN_SETTING_KEYS } from '@/lib/lifecycle/settings-keys';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { z } from 'zod';
import { PS5_RENTAL_STATUSES } from '@/lib/ps5-rental';

const INTERNAL_SETTING_KEYS = new Set([
  ...MESSAGING_SETTING_KEYS, ...RETIRED_SPIN_SETTING_KEYS,
  'watch_party_economy_version',
  'tower_enabled',
  'tower_rewards',
  'tower_defaults_version',
  'tower_run_duration_seconds',
  'tower_red_cards_per_floor',
  'guess_36_enabled',
  'guess_36_rewards',
  'guess_36_modes',
  'emic_rewards_catalog',
]);

const updateSchema = z.array(
  z.object({
    key:   z.string().min(1),
    value: z.string(),
    label: z.string().optional(),
  })
);

// GET — all settings with labels (admin UI)
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const settings = await prisma.setting.findMany({
    where: { key: { notIn: Array.from(INTERNAL_SETTING_KEYS) } },
    orderBy: { key: 'asc' },
  });
  return NextResponse.json({ settings });
}

// PUT — upsert one or more settings
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const result = updateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid data', issues: result.error.issues }, { status: 400 });
  }
  if (result.data.some((setting) => INTERNAL_SETTING_KEYS.has(setting.key))) {
    return NextResponse.json({ error: 'Internal settings cannot be edited.' }, { status: 400 });
  }
  for (const setting of result.data) {
    if (setting.key === 'daily_spin_reset_hour' && (!/^\d{1,2}$/.test(setting.value) || Number(setting.value) > 23)) {
      return NextResponse.json({ error: 'Spin reset hour must be a whole IST hour from 0 to 23.' }, { status: 400 });
    }
    if (setting.key === 'assistant_release_mode' && !['OFF', 'BETA', 'ON'].includes(setting.value)) {
      return NextResponse.json({ error: 'Assistant release mode must be OFF, BETA, or ON.' }, { status: 400 });
    }
    if (setting.key === 'assistant_beta_user_emails' && setting.value.length > 2_000) {
      return NextResponse.json({ error: 'Assistant beta allowlist is too long.' }, { status: 400 });
    }
    if (setting.key === 'ps5_rental_status' && !PS5_RENTAL_STATUSES.includes(setting.value as (typeof PS5_RENTAL_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid PS5 rental status.' }, { status: 400 });
    }
    if (setting.key === 'ps5_rental_price_per_day' || setting.key === 'ps5_rental_extra_controller') {
      const price = Number(setting.value);
      if (!Number.isSafeInteger(price) || price < 0 || price > 100_000) {
        return NextResponse.json({ error: 'PS5 rental prices must be whole numbers from 0 to 100,000.' }, { status: 400 });
      }
    }
  }

  const updated = await Promise.all(
    result.data.map((s) =>
      prisma.setting.upsert({
        where: { key: s.key },
        update: { value: s.value, ...(s.label ? { label: s.label } : {}) },
        create: { key: s.key, value: s.value, label: s.label },
      })
    )
  );

  return NextResponse.json({ settings: updated });
}
