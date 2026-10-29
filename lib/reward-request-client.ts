export class PendingRewardError extends Error {}
export async function submitRewardRequest(ownerId: string, operation: string, url: string, payload: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') {
  const key = `emiguild:reward:${ownerId}:${operation}`;
  let pending: { requestId: string; payload: Record<string, unknown> };
  const raw = localStorage.getItem(key);
  if (raw) {
    try { pending = JSON.parse(raw); if (!pending.requestId || !pending.payload) throw new Error(); }
    catch { throw new PendingRewardError('Saved request could not be read. Check history before clearing it.'); }
    const recovery = new AbortController();
    const recoveryTimer = setTimeout(() => recovery.abort(), 20_000);
    try {
      const response = await fetch(`/api/rewards/receipts/${operation}/${encodeURIComponent(pending.requestId)}`, { cache: 'no-store', signal: recovery.signal });
      if (response.ok) { const result = await response.json(); localStorage.removeItem(key); return result; }
      if (response.status !== 404) throw new PendingRewardError('Could not check the previous result. Try again.');
    } catch { throw new PendingRewardError('Could not check the previous result. Try again.'); }
    finally { clearTimeout(recoveryTimer); }
    if (JSON.stringify(pending.payload) !== JSON.stringify(payload)) throw new PendingRewardError('Check the previous request before submitting different details.');
  } else {
    pending = { requestId: crypto.randomUUID(), payload };
    localStorage.setItem(key, JSON.stringify(pending));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending.payload.kind ? { ...pending.payload, input: { ...(pending.payload.input as Record<string, unknown>), requestId: pending.requestId } } : { ...pending.payload, requestId: pending.requestId }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      if (response.status < 500) { localStorage.removeItem(key); throw new Error(data.error || 'Action unavailable.'); }
      throw new PendingRewardError(data.error || 'Check the previous result before retrying.');
    }
    localStorage.removeItem(key); return data;
  } catch (error) {
    if (error instanceof Error && !(error instanceof PendingRewardError) && error.name !== 'AbortError' && !localStorage.getItem(key)) throw error;
    throw new PendingRewardError('Could not confirm the result. Check result to recover or retry the same request.');
  } finally { clearTimeout(timer); }
}
