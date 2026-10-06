import { auth } from '@/auth';
import { canUseAssistant } from '@/lib/assistant/access';
import { createPublicChatHandler, generatePublicHelp } from '@/lib/assistant/chat';
import { getAssistantRuntimeConfig } from '@/lib/assistant/config';
import { loadCachedPublicKnowledge } from '@/lib/assistant/knowledge-cache';
import { getAssistantUsage, startAssistantRequest, releaseAssistantReservation, recordAssistantUsage } from '@/lib/assistant/usage';

export const runtime = 'nodejs';
export const POST = createPublicChatHandler({
  currentUser: async () => (await auth())?.user ?? null,
  enabled: canUseAssistant,
  config: getAssistantRuntimeConfig,
  knowledge: loadCachedPublicKnowledge,
  usage: getAssistantUsage,
  reserve: startAssistantRequest,
  release: releaseAssistantReservation,
  record: recordAssistantUsage,
  generate: generatePublicHelp,
});
