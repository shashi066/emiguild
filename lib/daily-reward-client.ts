export type DailyRewardKind = 'spin' | 'forge';
export type DailyRewardData = Record<string, any>;
export class DailyRewardError extends Error {
  constructor(message: string, public uncertain = false) { super(message); }
}
const flights = new Map<string, Promise<DailyRewardData>>();
async function request(url: string, init: RequestInit, fetcher: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } finally { clearTimeout(timer); }
}
const paths = { spin: '/api/daily-spin', forge: '/api/armory' };
export async function readDailyReward(kind: DailyRewardKind, fetcher: typeof fetch = fetch) {
  const { response, data } = await request(paths[kind], { cache: 'no-store' }, fetcher);
  if (!response.ok) throw new DailyRewardError(data.error || 'Unable to load your game. Please try again.');
  return data as DailyRewardData;
}
function existing(kind: DailyRewardKind, state: DailyRewardData) {
  return kind === 'spin' ? state.spin?.lootItem : state.forge?.todayClaim?.artifact;
}
function period(kind: DailyRewardKind, state: DailyRewardData) {
  return kind === 'spin' ? state.nextReset : state.forge?.nextResetAt;
}
function normalized(kind: DailyRewardKind, reward: any, state: DailyRewardData) {
  return kind === 'spin' ? { reward, streak: state.streak, streakReward: Boolean(state.spin?.streakReward) } : { selected: reward, state };
}
// A submitted request may complete after its browser connection is lost. Remember it
// across modal/page remounts and reconcile with GET; never automatically repeat POST.
async function runDailyReward(kind: DailyRewardKind, ownerId: string, options: {
  prepared?: (state: DailyRewardData) => void;
  fetcher?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
} = {}): Promise<DailyRewardData> {
  const fetcher = options.fetcher ?? fetch;
  const storage = options.storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  const key = `emiguild:pending:${ownerId}:${kind}`;
  const state = await readDailyReward(kind, fetcher);
  const reset = String(period(kind, state) ?? 'unknown');
  const pending = storage?.getItem(key);
  if (pending && pending !== reset) storage?.removeItem(key);
  if (pending === reset) {
    const reward = existing(kind, state);
    if (reward) { options.prepared?.(state); storage?.removeItem(key); return normalized(kind, reward, state); }
    throw new DailyRewardError('Your previous request may still be processing. Check status again before trying another action.', true);
  }
  const available = kind === 'spin' ? state.enabled && state.canSpin : state.forge?.canForge;
  if (!available) throw new DailyRewardError(kind === 'spin' ? 'Your daily spin is not available. It may already be used or paused.' : 'Your daily forge is not available. It may already be used or paused.');
  if (kind === 'spin' && !state.lootItems?.length) throw new DailyRewardError('No spin rewards are configured yet.');
  options.prepared?.(state);
  storage?.setItem(key, reset);
  try {
    const { response, data } = await request(kind === 'spin' ? paths.spin : '/api/armory/forge', { method: 'POST' }, fetcher);
    if (!response.ok) {
      if (response.status < 500) {
        storage?.removeItem(key);
        throw new DailyRewardError(data.error || 'This action is unavailable.');
      }
      throw new Error('Server response could not confirm the result.');
    }
    if (!(kind === 'spin' ? data.reward?.id : data.selected?.id)) throw new Error('Missing result');
    storage?.removeItem(key);
    return data;
  } catch (cause) {
    if (cause instanceof DailyRewardError) throw cause;
    try {
      const fresh = await readDailyReward(kind, fetcher);
      const reward = existing(kind, fresh);
      if (String(period(kind, fresh) ?? 'unknown') === reset && reward) {
        storage?.removeItem(key);
        return normalized(kind, reward, fresh);
      }
    } catch { /* Keep the pending marker until a status check can confirm it. */ }
    throw new DailyRewardError('We could not confirm the result. Your request may have succeeded. Check status; do not submit it again.', true);
  }
}

export function executeDailyReward(kind: DailyRewardKind, ownerId: string, options: Parameters<typeof runDailyReward>[2] = {}) {
  if (!ownerId) return Promise.reject(new DailyRewardError('Please sign in again.'));
  const key = `${ownerId}:${kind}`;
  const current = flights.get(key);
  if (current) return current;
  const operation = runDailyReward(kind, ownerId, options).finally(() => flights.delete(key));
  flights.set(key, operation);
  return operation;
}

export function animateDailySpin<T extends { reward: { id: string } }>(
  items: { id: string }[], operation: Promise<T>, highlight: (index: number | null) => void,
  signal: AbortSignal, reducedMotion = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let steps = 0;
    let result: T | undefined;
    let done = false;
    const stop = () => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { done = true; stop(); reject(new Error('Animation closed')); };
    const tick = () => {
      if (done) return;
      if (result && (reducedMotion || steps >= 28)) {
        const winner = items.findIndex(item => item.id === result!.reward.id);
        highlight(winner < 0 ? null : winner);
        timer = setTimeout(() => { done = true; stop(); resolve(result!); }, reducedMotion ? 0 : 600);
        return;
      }
      if (!reducedMotion && items.length) highlight(Math.floor(Math.random() * items.length));
      steps++;
      timer = setTimeout(tick, reducedMotion ? 100 : steps < 20 ? 60 : Math.min(760, 120 + (steps - 20) * 80));
    };
    operation.then(value => { result = value; }, error => { if (!done) { done = true; stop(); reject(error); } });
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    tick();
  });
}

export function waitForRewardReveal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('Animation closed')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
