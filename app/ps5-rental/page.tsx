import styles from './rental-theme.module.css';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft, Clock3, Gamepad2, PackageCheck, Truck } from 'lucide-react';
import Ps5RentalClient from '@/components/Ps5RentalClient';
import { parsePs5RentalPrice, resolvePs5RentalAvailability } from '@/lib/ps5-rental';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Rent a PS5 — Home Delivery',
  description:
    'Rent a PS5 console with games delivered to your doorstep. Choose your games, pick rental days, and enjoy gaming at home!',
};

export default async function Ps5RentalPage() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['ps5_rental_status', 'ps5_rental_enabled', 'ps5_rental_price_per_day', 'ps5_rental_extra_controller'] } },
  });
  const settingsMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  const availability = resolvePs5RentalAvailability(settingsMap);
  if (availability !== 'AVAILABLE') {
    const comingSoon = availability === 'COMING_SOON';
    return (
      <div className={`page-wrapper ps5-rental-status-page ${styles.theme}`}><div className="container">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}><ArrowLeft size={16} />Back to Home</Link>
        <div className={`ps5-rental-status-card ${comingSoon ? 'is-coming-soon' : 'is-disabled'}`}>
          <div className="ps5-rental-status-glow" aria-hidden="true" />
          <div className="ps5-rental-status-icon" aria-hidden="true"><Gamepad2 size={42} /></div>
          <div className="ps5-rental-status-kicker">PS5 Home Rental</div>
          <h1>{comingSoon ? 'Your Next Gaming Setup Is On Its Way' : 'PS5 Rental Unavailable'}</h1>
          <p>{comingSoon ? 'We are preparing consoles, controllers, games, and doorstep delivery for launch. Check back soon to place your rental request.' : 'The PS5 home rental service is currently unavailable. Please check back later.'}</p>
          {comingSoon && <>
            <div className="ps5-rental-coming-pill"><Clock3 size={15} /> Launching Soon</div>
            <div className="ps5-rental-preview" aria-label="What to expect">
              <span><Gamepad2 size={18} /><strong>PS5 Console</strong><small>Ready to play</small></span>
              <span><PackageCheck size={18} /><strong>Your Games</strong><small>Pre-installed</small></span>
              <span><Truck size={18} /><strong>Home Delivery</strong><small>To your doorstep</small></span>
            </div>
          </>}
        </div>
      </div></div>
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/ps5-rental');
  const [games, user] = await Promise.all([
    prisma.game.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, phone: true },
    }),
  ]);

  const pricePerDay = parsePs5RentalPrice(settingsMap.ps5_rental_price_per_day, 1200);
  const controllerPrice = parsePs5RentalPrice(settingsMap.ps5_rental_extra_controller, 500);

  const groupedGames = games.reduce((acc, game) => {
    if (!acc[game.category]) acc[game.category] = [];
    acc[game.category].push({ id: game.id, name: game.name });
    return acc;
  }, {} as Record<string, { id: string; name: string }[]>);

  return (
    <div className={`page-wrapper ${styles.theme}`}>
      <div className="container">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        <Ps5RentalClient
          enabled
          pricePerDay={pricePerDay}
          controllerPrice={controllerPrice}
          groupedGames={groupedGames}
          userName={user?.name ?? ''}
          userPhone={user?.phone ?? ''}
        />
      </div>
    </div>
  );
}
