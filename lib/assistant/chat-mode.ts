export const ASSISTANT_CHAT_MODES = ['EMIGUILD_ONLY', 'GAMING_COMPANION', 'GENERAL_ASSISTANT'] as const;
export type AssistantChatMode = typeof ASSISTANT_CHAT_MODES[number];
export const ASSISTANT_CHAT_MODE_LABELS: Record<AssistantChatMode, string> = {
  EMIGUILD_ONLY: 'EmiGuild only',
  GAMING_COMPANION: 'Gaming companion',
  GENERAL_ASSISTANT: 'General assistant',
};
