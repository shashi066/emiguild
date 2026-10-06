import { unstable_cache, revalidateTag } from 'next/cache';
import { getIndiaClock } from '@/lib/public-booking-time';
import { loadPublicKnowledge } from './public-knowledge';

const TAG = 'assistant-public-knowledge';
const cachedKnowledge = unstable_cache(async (_date: string) => loadPublicKnowledge(), [TAG], { revalidate: 30, tags: [TAG] });
export function loadCachedPublicKnowledge() {
  return cachedKnowledge(getIndiaClock().date);
}
export function invalidateAssistantKnowledge() {
  revalidateTag(TAG, { expire: 0 });
}
