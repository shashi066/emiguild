import { Suspense } from 'react';
import BookPageInner from './BookPageInner';
import { prisma } from '@/lib/prisma';

export const metadata = {
  title: 'Book a Gaming Session',
  description:
    'Reserve your gaming station at GameZone Cafe. Choose your date, station, and time slot.',
};

export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const serverNow = new Date().toISOString();

  // Fetch settings on the server side to prevent banner pop-in / late loading
  const settings = await prisma.setting.findMany();
  const initialSettings: Record<string, string> = {};
  for (const s of settings) {
    initialSettings[s.key] = s.value;
  }

  return (
    <Suspense
      fallback={
        <div
          className="page-wrapper"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Loading booking form...
          </div>
        </div>
      }
    >
      <BookPageInner serverNow={serverNow} initialSettings={initialSettings} />
    </Suspense>
  );
}

