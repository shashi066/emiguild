import { z } from 'zod';
import type { AssistantMessage } from '@/types/assistant';
import { PUBLIC_HELP_LINKS } from './public-help';

import { CHAT_MESSAGE_LIMIT, CHAT_HISTORY_LIMIT, CHAT_DISPLAY_LIMIT } from './chat-limits';
const PREFIX = 'emi-assistant-chat-v1:';
const MAX_STORAGE_LENGTH = 400_000;
const messageSchema = z.object({
  role: z.enum(['user', 'assistant']), content: z.string().min(1).max(CHAT_MESSAGE_LIMIT),
  links: z.array(z.object({ label: z.string(), href: z.string(), kind: z.enum(['internal', 'external', 'phone']).optional() }).strict()).max(3).optional(),
}).strict();
const memorySchema = z.object({
  version: z.literal(1), messages: z.array(messageSchema).max(CHAT_DISPLAY_LIMIT),
  transcript: z.array(messageSchema).max(CHAT_HISTORY_LIMIT),
}).strict();
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
type StorageSource = () => StorageAccess;
const browserStorage: StorageSource = () => sessionStorage;
const safeLinks = (messages: AssistantMessage[]) => messages.map((message) => ({ ...message,
  links: message.links?.flatMap((link) => {
    const approved = Object.values(PUBLIC_HELP_LINKS).find((item) => item.href === link.href && item.label === link.label);
    return approved ? [approved] : [];
  }),
}));

export function readChatMemory(accountId: string, source: StorageSource = browserStorage) {
  try {
    const storage = source();
    const raw = storage.getItem(PREFIX + accountId);
    if (!raw) return null;
    if (raw.length > MAX_STORAGE_LENGTH) throw new Error('Oversized memory');
    const value = memorySchema.parse(JSON.parse(raw));
    return { messages: safeLinks(value.messages), transcript: safeLinks(value.transcript) };
  } catch {
    try { source().removeItem(PREFIX + accountId); } catch { /* Temporary memory still works. */ }
    return null;
  }
}

export function writeChatMemory(accountId: string, messages: AssistantMessage[], transcript: AssistantMessage[], source: StorageSource = browserStorage) {
  try {
    const value = memorySchema.parse({ version: 1, messages: messages.slice(-CHAT_DISPLAY_LIMIT), transcript: transcript.slice(-CHAT_HISTORY_LIMIT) });
    const raw = JSON.stringify(value);
    if (raw.length > MAX_STORAGE_LENGTH) throw new Error('Oversized memory');
    source().setItem(PREFIX + accountId, raw);
  } catch { /* Storage is optional; keep the live conversation. */ }
}

export function clearChatMemory(source: StorageSource = browserStorage) {
  try {
    const storage = source();
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key?.startsWith(PREFIX)) storage.removeItem(key);
    }
  } catch { /* Storage can be disabled. */ }
}
