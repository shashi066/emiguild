import { auth } from '@/auth';
import { canUseAssistant } from '@/lib/assistant/access';
import { createPublicChatHandler, generatePublicHelp } from '@/lib/assistant/chat';
import { getAssistantRuntimeConfig } from '@/lib/assistant/config';
import { loadPublicKnowledge } from '@/lib/assistant/public-knowledge';
import { getAssistantUsage, startAssistantRequest, releaseAssistantReservation, recordAssistantUsage } from '@/lib/assistant/usage';

export const runtime = 'nodejs';
export const POST = createPublicChatHandler({
  currentUser: async () => (await auth())?.user ?? null,
  enabled: canUseAssistant,
  config: getAssistantRuntimeConfig,
  knowledge: loadPublicKnowledge,
  usage: getAssistantUsage,
  reserve: startAssistantRequest,
  release: releaseAssistantReservation,
  record: recordAssistantUsage,
  generate: generatePublicHelp,
});
