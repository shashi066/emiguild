import OpenAI from 'openai';
import type { AssistantErrorCategory } from '@/types/assistant';

export class AssistantGenerationError extends Error {
  constructor(public readonly category: AssistantErrorCategory) { super(category); }
}
export function chatErrorCategory(error: unknown): AssistantErrorCategory {
  if (error instanceof AssistantGenerationError) return error.category;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return 'timeout';
  return 'provider_failure';
}
export function chatErrorMessage(category: AssistantErrorCategory) {
  const descriptions: Record<AssistantErrorCategory, string> = {
    provider_failure: 'The AI service could not answer this time.',
    timeout: 'The AI service took too long to respond.',
    incomplete_output: 'The AI response ended before the answer was complete.',
    invalid_response: 'The AI response could not be displayed safely.',
  };
  return `${descriptions[category]} This request used one AI allowance. You can retry manually or use the buttons.`;
}

export function logChatFailure(error: unknown, category: AssistantErrorCategory) {
  // Never log the exception, message, response body, request or account identity.
  const status = error instanceof OpenAI.APIError && Number.isInteger(error.status) ? error.status : undefined;
  console.error('assistant_generation_failed', { category, ...(status === undefined ? {} : { status }) });
}
