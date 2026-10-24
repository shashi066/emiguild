export const HOMEPAGE_MINIMUM_MS = 7000;
export type HomepageProgress = { value: number; phase: 'loading' | 'ready' | 'error'; slow: boolean };
export function estimateHomepageProgress(elapsed: number, reducedMotion = false) {
  if (reducedMotion) return elapsed >= 6600 ? 99 : elapsed >= 2100 ? 90 : elapsed >= 900 ? 70 : 0;
  if (elapsed < 900) return Math.round(Math.max(0, elapsed) / 900 * 70);
  if (elapsed < 2100) return 70 + Math.round((elapsed - 900) / 1200 * 20);
  return Math.min(99, 90 + Math.floor((elapsed - 2100) / 500));
}

/** Owns one entry sequence. Resource completion, never elapsed time, unlocks 100%. */
export function createHomepageProgress(options: {
  minimumDurationMs?: number;
  now?: () => number;
  frame?: (callback: () => void) => number;
  cancelFrame?: (id: number) => void;
  reducedMotion?: () => boolean;
} = {}) {
  const minimumDuration = options.minimumDurationMs ?? HOMEPAGE_MINIMUM_MS;
  let entryStarted: number | undefined;
  let minimumTimer: ReturnType<typeof setTimeout> | undefined;
  const now = options.now ?? (() => performance.now());
  const frame = options.frame ?? (callback => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? (id => cancelAnimationFrame(id));
  const reduced = options.reducedMotion ?? (() => false);
  let snapshot: HomepageProgress = { value: 0, phase: 'loading', slow: false };
  const serverSnapshot = snapshot;
  const listeners = new Set<() => void>();
  const signals = new Set<'page' | 'hero'>();
  let active = false;
  let visible = true;
  let elapsed = 0;
  let started = 0;
  let frameId: number | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  const emit = (next: HomepageProgress) => {
    if (next.value === snapshot.value && next.phase === snapshot.phase && next.slow === snapshot.slow) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const stopTimers = () => { clearInterval(interval); clearTimeout(slowTimer); interval = undefined; slowTimer = undefined; };
  const currentElapsed = () => elapsed + (active && visible ? now() - started : 0);
  const tick = () => {
    if (!active || !visible || snapshot.phase !== 'loading') return;
    const value = estimateHomepageProgress(currentElapsed(), reduced());
    emit({ ...snapshot, value: Math.max(snapshot.value, value) });
    if (value === 99) { clearInterval(interval); interval = undefined; }
  };
  const scheduleReady = () => {
    if (!active || !visible || signals.size !== 2 || snapshot.phase !== 'loading' || frameId !== undefined) return;
    const remaining = minimumDuration - (now() - (entryStarted ?? now()));
    if (remaining > 0) {
      if (minimumTimer === undefined) minimumTimer = setTimeout(() => { minimumTimer = undefined; scheduleReady(); }, remaining);
      return;
    }
    frameId = frame(() => {
      frameId = undefined;
      if (!active || !visible || snapshot.phase !== 'loading') return;
      stopTimers(); clearTimeout(minimumTimer); minimumTimer = undefined;
      emit({ value: 100, phase: 'ready', slow: false });
    });
  };
  const resume = () => {
    if (!active || !visible || snapshot.phase !== 'loading') return;
    started = now();
    if (snapshot.value < 99) interval = setInterval(tick, 100);
    slowTimer = setTimeout(() => emit({ ...snapshot, slow: true }), Math.max(0, 10000 - elapsed));
    scheduleReady();
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    getPhase: () => snapshot.phase,
    start() { if (active) return; active = true; entryStarted ??= now(); resume(); },
    mark(signal: 'page' | 'hero') { signals.add(signal); scheduleReady(); },
    setVisible(next: boolean) {
      if (visible === next) return;
      if (active && visible) elapsed += now() - started;
      visible = next;
      stopTimers();
      if (!visible && frameId !== undefined) { cancelFrame(frameId); frameId = undefined; }
      if (visible) resume();
    },
    fail() {
      stopTimers(); clearTimeout(minimumTimer); minimumTimer = undefined;
      if (frameId !== undefined) cancelFrame(frameId);
      frameId = undefined;
      emit({ ...snapshot, phase: 'error' });
    },
    reset() {
      stopTimers(); clearTimeout(minimumTimer); minimumTimer = undefined; entryStarted = now();
      if (frameId !== undefined) cancelFrame(frameId);
      frameId = undefined;
      signals.clear(); elapsed = 0;
      emit({ value: 0, phase: 'loading', slow: false });
      resume();
    },
    dispose() {
      if (active && visible) elapsed += now() - started;
      active = false; stopTimers(); clearTimeout(minimumTimer); minimumTimer = undefined; entryStarted = undefined;
      if (frameId !== undefined) cancelFrame(frameId);
      frameId = undefined;
      // React may retain a route segment while disconnecting its effects.
      // Reset for the next activation, without notifying an unmounting view.
      signals.clear(); elapsed = 0; snapshot = serverSnapshot;
    },
  };
}
export type HomepageProgressController = ReturnType<typeof createHomepageProgress>;
