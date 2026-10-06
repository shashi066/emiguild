import { prisma } from '@/lib/prisma';
import { MessagingSettings } from './rules';

export async function getMessagingSettings(): Promise<MessagingSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['lifecycle_email_digest', 'lifecycle_comeback_email'] } }, select: { key: true, value: true } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { comebackEmail: values.lifecycle_comeback_email === 'true', emailDigest: values.lifecycle_email_digest === 'true' };
}
