import { Suspense } from 'react';
import BookPageInner from './BookPageInner';

export const metadata = {
  title: 'Book a Gaming Session',
  description:
    'Reserve your gaming station at GameZone Cafe. Choose your date, station, and time slot.',
};

export const dynamic = 'force-dynamic';

export default function BookPage() {
  const serverNow = new Date().toISOString();

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
      <BookPageInner serverNow={serverNow} />
    </Suspense>
  );
}
