import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { ASSISTANT_CHAT_MODES } from './chat-mode';

export const ASSISTANT_CONFIG_KEY = 'assistant_ai_config';
export const DEFAULT_AI_MODEL = 'gpt-6-luna';
export const DEFAULT_AI_DAILY_LIMIT = 10;
const modelSchema = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const limitSchema = z.number().int().min(1).max(1000);
const chatModeSchema = z.enum(ASSISTANT_CHAT_MODES);
const storedSchema = z.object({ model: modelSchema, dailyLimit: limitSchema, encryptedApiKey: z.string().nullable(), chatMode: chatModeSchema.default('EMIGUILD_ONLY') }).strict();
export const assistantConfigUpdateSchema = z.object({
  model: modelSchema, dailyLimit: limitSchema,
  chatMode: chatModeSchema.optional(),
  apiKey: z.string().trim().min(10).max(512).regex(/^sk-[a-zA-Z0-9_-]+$/).optional(),
  clearApiKey: z.boolean().optional(),
}).strict().refine((value) => !(value.apiKey && value.clearApiKey));

function encryptionKey(secret = process.env.AUTH_SECRET) {
  if (!secret) throw new Error('Server authentication secret is required to secure the API key.');
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'emiguild', 'assistant-api-key-v1', 32));
}
export function encryptAssistantKey(value: string, secret?: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(ASSISTANT_CONFIG_KEY));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptAssistantKey(value: string, secret?: string) {
  const [version, iv, tag, data, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Invalid saved API key.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(ASSISTANT_CONFIG_KEY));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
function decodeConfig(value?: string) {
  return storedSchema.parse(value ? JSON.parse(value) : { model: DEFAULT_AI_MODEL, dailyLimit: DEFAULT_AI_DAILY_LIMIT, encryptedApiKey: null });
}
async function readConfig() {
  const row = await prisma.setting.findUnique({ where: { key: ASSISTANT_CONFIG_KEY }, select: { value: true } });
  return decodeConfig(row?.value);
}
export async function getAssistantConfigSummary() {
  const config = await readConfig();
  return { model: config.model, dailyLimit: config.dailyLimit, chatMode: config.chatMode, keyConfigured: !!config.encryptedApiKey };
}
export async function getAssistantRuntimeConfig() {
  const config = await readConfig();
  return { model: config.model, dailyLimit: config.dailyLimit, chatMode: config.chatMode, apiKey: config.encryptedApiKey ? decryptAssistantKey(config.encryptedApiKey) : null };
}
export async function saveAssistantConfig(input: z.infer<typeof assistantConfigUpdateSchema>) {
  const encrypted = input.apiKey ? encryptAssistantKey(input.apiKey) : undefined;
  await runSerializableTransaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { key: ASSISTANT_CONFIG_KEY }, select: { value: true } });
    const previousConfig = decodeConfig(row?.value);
    const previous = encrypted === undefined && !input.clearApiKey ? previousConfig.encryptedApiKey : null;
    const value = JSON.stringify({ model: input.model, dailyLimit: input.dailyLimit, chatMode: input.chatMode ?? previousConfig.chatMode, encryptedApiKey: encrypted ?? previous });
    await tx.setting.upsert({ where: { key: ASSISTANT_CONFIG_KEY }, create: { key: ASSISTANT_CONFIG_KEY, value, label: 'Encrypted assistant AI configuration' }, update: { value } });
  });
  return getAssistantConfigSummary();
}
