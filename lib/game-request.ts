import { z } from 'zod';

export const CUSTOMER_GAME_REQUEST_MAX_LENGTH = 160;
export const ADMIN_GAME_REQUEST_MAX_LENGTH = 300;

function optionalTrimmedText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, `Game request must be ${maxLength} characters or fewer`)
    .optional()
    .transform((value) => value || undefined);
}

export const customerGameRequestSchema = optionalTrimmedText(
  CUSTOMER_GAME_REQUEST_MAX_LENGTH,
);

export const adminGameRequestSchema = optionalTrimmedText(
  ADMIN_GAME_REQUEST_MAX_LENGTH,
);
