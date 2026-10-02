import { prisma } from '@/lib/prisma';

export type AssistantReleaseMode = 'OFF' | 'BETA' | 'ON';

export async function getAssistantReleaseSettings() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['assistant_release_mode', 'assistant_beta_user_emails'] } },
    select: { key: true, value: true },
  });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const rawMode = values.assistant_release_mode?.toUpperCase();
  const mode: AssistantReleaseMode = rawMode === 'ON' || rawMode === 'BETA' ? rawMode : 'OFF';
  const betaEmails = new Set(
    (values.assistant_beta_user_emails ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  return { mode, betaEmails };
}

export async function canUseAssistant(user?: { email?: string | null; role?: string | null } | null) {
  const { mode, betaEmails } = await getAssistantReleaseSettings();
  if (mode === 'ON') return true;
  if (mode === 'BETA' && user?.email) return betaEmails.has(user.email.toLowerCase());
  return false;
}
