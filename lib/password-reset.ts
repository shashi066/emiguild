import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const NUMBERS = '23456789';
const SYMBOLS = '@#!';
const ALL_CHARACTERS = `${UPPERCASE}${LOWERCASE}${NUMBERS}${SYMBOLS}`;

function randomCharacter(characters: string) {
  return characters[crypto.randomInt(0, characters.length)];
}

function secureShuffle(characters: string[]) {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters;
}

export function generateTemporaryPassword(length = 10) {
  if (length < 4) throw new Error('Temporary password length must be at least 4.');

  const password = [
    randomCharacter(UPPERCASE),
    randomCharacter(LOWERCASE),
    randomCharacter(NUMBERS),
    randomCharacter(SYMBOLS),
  ];

  while (password.length < length) {
    password.push(randomCharacter(ALL_CHARACTERS));
  }

  return secureShuffle(password).join('');
}

export function getPasswordResetDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;

  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
