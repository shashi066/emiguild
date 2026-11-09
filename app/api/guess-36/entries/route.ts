import { lifecycleJson } from '@/lib/lifecycle/http';
// Legacy entries are closed. Previously entered rounds can still settle.
export async function POST() {
 return lifecycleJson({ error: 'Number picks have been replaced by Guild Expedition. Refresh Guess 36.', code: 'LEGACY_CLOSED' }, 410);
}
