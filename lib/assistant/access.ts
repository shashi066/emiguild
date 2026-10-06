import { prisma } from '@/lib/prisma';

export type AssistantReleaseMode = 'OFF' | 'ON';

export async function getAssistantReleaseSettings() {
  const row = await prisma.setting.findUnique({
    where: { key: 'assistant_release_mode' },
    select: { value: true },
  });
  const rawMode = row?.value.toUpperCase();
  // Compatibility for installations that saved the retired release value.
  const mode: AssistantReleaseMode = rawMode === 'ON' || rawMode === 'BETA' ? 'ON' : 'OFF';
  return { mode };
}

export async function canUseAssistant(_user?: object | null) {
  const { mode } = await getAssistantReleaseSettings();
  return mode === 'ON';
}
