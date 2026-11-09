// Browser-only. Requests a database warm-up ahead of a side quest, at most once every 2 minutes per
// tab. Never throws and never blocks the UI.
const INTERVAL_MS = 2 * 60_000;
const STORAGE_KEY = 'emiguild:warm-at';
let lastWarm = 0;

export function warmServer() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  try { lastWarm = Math.max(lastWarm, Number(sessionStorage.getItem(STORAGE_KEY)) || 0); } catch { /* Storage unavailable. */ }
  if (now - lastWarm < INTERVAL_MS && now >= lastWarm) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (navigator.onLine === false || connection?.saveData) return;
  lastWarm = now;
  try { sessionStorage.setItem(STORAGE_KEY, String(now)); } catch { /* Storage unavailable. */ }
  fetch('/api/warm', { cache: 'no-store', keepalive: true }).catch(() => {});
}
