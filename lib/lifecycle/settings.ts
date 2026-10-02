import { prisma } from '@/lib/prisma';
import { MessagingSettings } from './rules';
import { MESSAGING_SETTING_KEYS } from './settings-keys';

export async function getMessagingSettings(): Promise<MessagingSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...MESSAGING_SETTING_KEYS] } } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { comebackEmail: values.lifecycle_comeback_email === 'true', emailDigest: values.lifecycle_email_digest === 'true' };
}
