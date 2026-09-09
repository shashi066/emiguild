import type { Guess36Mode, Guess36Reward, Guess36Rewards, Guess36Selection, Guess36Tier } from './guess-36-types';

export const GUESS_36_NUMBERS = Array.from({ length: 36 }, (_, index) => index + 1);
export const DEFAULT_GUESS_36_MODES: Guess36Mode[] = ['NUMBER', 'PARITY', 'RANGE'];
export const GUESS_36_TIERS: { id: Guess36Tier; label: string; chance: string }[] = [
  { id: 'EXACT', label: 'Exact number', chance: '1 in 36' },
  { id: 'GROUP', label: 'Range', chance: '1 in 3' },
  { id: 'PARITY', label: 'Even or odd', chance: '1 in 2' },
];
export const DEFAULT_GUESS_36_REWARDS = {
  EXACT: { type: 'GAMING_TIME', value: 60, name: '60 Minutes Gaming' },
  GROUP: { type: 'GAMING_TIME', value: 15, name: '15 Minutes Gaming' },
  PARITY: { type: 'GAMING_TIME', value: 10, name: '10 Minutes Gaming' },
} satisfies Guess36Rewards;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGuess36Selection(value: unknown): Guess36Selection | null {
  if (!record(value)) return null;
  if (value.type === 'EVEN' || value.type === 'ODD') {
    return Object.keys(value).length === 1 ? { type: value.type } : null;
  }
  if (value.type !== 'NUMBER' && value.type !== 'RANGE' && value.type !== 'ROW') return null;
  if (Object.keys(value).length !== 2 || !Number.isInteger(value.value)) return null;
  const number = Number(value.value);
  if (number < 1 || number > (value.type === 'NUMBER' ? 36 : 3)) return null;
  return { type: value.type, value: number };
}

export function guess36Tier(selection: Guess36Selection): Guess36Tier {
  return selection.type === 'NUMBER' ? 'EXACT'
    : selection.type === 'EVEN' || selection.type === 'ODD' ? 'PARITY' : 'GROUP';
}

export function guess36SelectionLabel(selection: Guess36Selection) {
  switch (selection.type) {
    case 'NUMBER': return `Number ${selection.value}`;
    case 'EVEN': return 'Even';
    case 'ODD': return 'Odd';
    case 'RANGE': return `${(selection.value - 1) * 12 + 1}-${selection.value * 12}`;
    case 'ROW': return `Row ${selection.value}`;
  }
}

export function guess36SelectionMatches(selection: Guess36Selection, number: number) {
  return guess36WinningSelections(number).some((winner) => winner.type === selection.type
    && (!('value' in winner) || ('value' in selection && winner.value === selection.value)));
}

export function guess36WinningSelections(number: number): Guess36Selection[] {
  if (!Number.isInteger(number) || number < 1 || number > 36) return [];
  return [
    { type: 'NUMBER', value: number },
    { type: number % 2 === 0 ? 'EVEN' : 'ODD' },
    { type: 'RANGE', value: Math.ceil(number / 12) },
    { type: 'ROW', value: ((number - 1) % 3) + 1 },
  ];
}

export function guess36CoveredNumbers(selection: Guess36Selection) {
  return GUESS_36_NUMBERS.filter((number) => guess36SelectionMatches(selection, number));
}

export function normalizeGuess36Reward(value: unknown): Guess36Reward {
  if (!record(value) || Object.keys(value).some((key) => !['type', 'name', 'value'].includes(key))) {
    throw new Error('Choose a valid reward type and value.');
  }
  if (value.type === 'PASS') {
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80 || value.value !== undefined) {
      throw new Error('Enter a Pass name from 1 to 80 characters.');
    }
    return { type: 'PASS', name: value.name.trim() };
  }
  if (!['GAMING_TIME', 'RACING_TIME', 'DISCOUNT', 'EMIC'].includes(String(value.type))) {
    throw new Error('Choose Gaming Time, Racing Time, Discount, Pass, or EMIC Coins.');
  }
  const amount = value.value;
  const max = value.type === 'DISCOUNT' ? 100 : value.type === 'EMIC' ? 1_000_000 : 10_000;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > max) {
    throw new Error(value.type === 'DISCOUNT'
      ? 'Discount must be a whole percentage from 1 to 100.'
      : value.type === 'EMIC'
        ? 'EMIC must be a whole number from 1 to 1,000,000.'
        : 'Minutes must be a whole number from 1 to 10,000.');
  }
  const type = value.type as Guess36Reward['type'];
  const name = type === 'EMIC' ? `${amount} EMIC`
    : type === 'DISCOUNT' ? `${amount}% Booking Discount`
    : `${amount} ${amount === 1 ? 'Minute' : 'Minutes'} ${type === 'GAMING_TIME' ? 'Gaming' : 'Racing'}`;
  return { type, value: amount, name };
}

export function normalizeGuess36Rewards(value: unknown): Guess36Rewards {
  if (!record(value) || Object.keys(value).length !== 3 || !GUESS_36_TIERS.every(({ id }) => id in value)) {
    throw new Error('Configure all three reward tiers.');
  }
  return {
    EXACT: normalizeGuess36Reward(value.EXACT),
    GROUP: normalizeGuess36Reward(value.GROUP),
    PARITY: normalizeGuess36Reward(value.PARITY),
  };
}

export function normalizeGuess36Modes(value: unknown): Guess36Mode[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > DEFAULT_GUESS_36_MODES.length
    || new Set(value).size !== value.length
    || value.some((mode) => !DEFAULT_GUESS_36_MODES.includes(mode as Guess36Mode))) {
    throw new Error('Enable at least one valid pick type.');
  }
  return DEFAULT_GUESS_36_MODES.filter((mode) => value.includes(mode));
}
