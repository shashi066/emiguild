import { getIstDateKey } from './guess-36-clock';

export const happyBalanceSelect = {
  happyAvailable: true, happyVersion: true, happyBalanceDay: true,
  happyLastClaimedAt: true, createdAt: true,
} as const;

type Balance = {
  happyAvailable: number; happyVersion: number; happyBalanceDay: string | null;
  happyLastClaimedAt: Date | null; createdAt: Date;
};

/** Read-only projection: a claim replaces that day's midnight stock expiry. */
export function happyBalance(account: Balance, now: Date) {
  const day = getIstDateKey(now);
  const checkpoint = account.happyBalanceDay ?? getIstDateKey(account.createdAt);
  const elapsed = Math.max(0, Math.floor((Date.parse(day) - Date.parse(checkpoint)) / 86_400_000));
  const claimedOnCheckpoint = account.happyLastClaimedAt && getIstDateKey(account.happyLastClaimedAt) === checkpoint;
  const loss = Math.max(0, elapsed - (claimedOnCheckpoint ? 1 : 0));
  return {
    available: Math.max(0, Math.min(5, account.happyAvailable) - loss),
    version: account.happyVersion + elapsed,
    day,
  };
}
