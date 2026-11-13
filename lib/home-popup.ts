import { z } from 'zod';

export const HOME_POPUP_SETTING_KEY = 'home_popup';
export const HOME_POPUP_MAX_PRICES = 6;
export const HOME_POPUP_ACTIONS = ['none', 'whatsapp', 'link'] as const;
export type HomePopupAction = (typeof HOME_POPUP_ACTIONS)[number];

/** Suggested label per action; the admin editor swaps between these when the action changes. */
export const HOME_POPUP_DEFAULT_LABELS: Record<Exclude<HomePopupAction, 'none'>, string> = {
  whatsapp: 'Pre-book on WhatsApp',
  link: 'Visit website',
};

export function isHomePopupAction(value: string): value is HomePopupAction {
  return (HOME_POPUP_ACTIONS as readonly string[]).includes(value);
}

const text = (max: number) => z.string().trim().max(max);

/** Accepts "emiguildwars.in" or a full URL; only http(s) links pass. Returns '' when invalid. */
export function normalizePopupLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.toString() : '';
  } catch {
    return '';
  }
}

export const homePopupSchema = z.object({
  enabled: z.boolean(),
  eyebrow: text(40),
  title: text(60).min(1, 'Title is required.'),
  subtitle: text(160),
  prices: z.array(z.object({
    label: text(20).min(1, 'Every price needs a label.'),
    amount: z.number().int('Prices must be whole rupees.').min(0).max(100_000),
  })).max(HOME_POPUP_MAX_PRICES, `Up to ${HOME_POPUP_MAX_PRICES} prices.`),
  note: text(160),
  buttonLabel: text(40),
  actionType: z.enum(HOME_POPUP_ACTIONS).default('whatsapp'),
  whatsappNumber: z.string().trim(),
  whatsappMessage: text(300),
  linkUrl: text(300).default(''),
}).superRefine((popup, context) => {
  if (popup.actionType !== 'none' && !popup.buttonLabel) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['buttonLabel'], message: 'Button label is required.' });
  }
  if (popup.actionType === 'whatsapp' && !/^\d{10,15}$/.test(popup.whatsappNumber)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['whatsappNumber'], message: 'WhatsApp number must be 10–15 digits, country code included (e.g. 919989562474).' });
  }
  if (popup.actionType === 'link' && !normalizePopupLink(popup.linkUrl)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['linkUrl'], message: 'Enter a valid website link, e.g. emiguildwars.in or https://emiguildwars.in.' });
  }
}).transform((popup) => ({ ...popup, linkUrl: normalizePopupLink(popup.linkUrl) }));

export type HomePopupConfig = z.output<typeof homePopupSchema>;

export const DEFAULT_HOME_POPUP: HomePopupConfig = {
  enabled: true,
  eyebrow: 'Pre-bookings live',
  title: 'GTA 6',
  subtitle: 'Lock in your GTA 6 session before launch day.',
  prices: [
    { label: '1 hr', amount: 250 },
    { label: '2 hrs', amount: 450 },
    { label: '3 hrs', amount: 600 },
  ],
  note: 'Separate from regular game bookings and passes.',
  buttonLabel: HOME_POPUP_DEFAULT_LABELS.whatsapp,
  actionType: 'whatsapp',
  whatsappNumber: '919989562474',
  whatsappMessage: 'Hi EmiGuild, I want to pre-book GTA 6.',
  linkUrl: '',
};

/** Validates a stored or submitted popup; returns the first problem as a readable message. */
export function validateHomePopup(input: unknown): { ok: true; config: HomePopupConfig } | { ok: false; error: string } {
  const result = homePopupSchema.safeParse(input);
  return result.success
    ? { ok: true, config: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? 'Invalid home popup.' };
}

/** Reads the stored setting; anything missing or invalid falls back to the default so Home never breaks. */
export function parseHomePopup(value: string | null | undefined): HomePopupConfig {
  if (!value) return DEFAULT_HOME_POPUP;
  try {
    const result = validateHomePopup(JSON.parse(value));
    return result.ok ? result.config : DEFAULT_HOME_POPUP;
  } catch {
    return DEFAULT_HOME_POPUP;
  }
}

export function whatsappHref(config: Pick<HomePopupConfig, 'whatsappNumber' | 'whatsappMessage'>) {
  const number = config.whatsappNumber.replace(/\D/g, '');
  const message = config.whatsappMessage.trim();
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/** Where the popup button goes; null when the popup has no button. */
export function popupActionHref(config: HomePopupConfig): string | null {
  if (config.actionType === 'none') return null;
  if (config.actionType === 'link') return normalizePopupLink(config.linkUrl) || null;
  return whatsappHref(config);
}
