import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomeEntryProvider } from '@/components/providers/HomeEntryProvider';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ActivityTracker } from '@/components/lifecycle/ActivityTracker';
import { auth } from '@/auth';
import { canUseAssistant } from '@/lib/assistant/access';
import { EmiAssistant } from '@/components/assistant/EmiAssistant';

export const metadata: Metadata = {
  title: {
    default: 'EmiGuild Gaming Cafe — PS5 & Racing Simulator Booking',
    template: '%s | EmiGuild Gaming Cafe',
  },
  description: 
    'EmiGuild Gaming Cafe in Kothapet, Hyderabad offers PS5, racing simulators, and premium gaming stations. Reserve your slot online for an immersive gaming experience. Walk in ready to play!',
  keywords: [
    'EmiGuild Cafe',
    'EmiGuild Gaming',
    'EmiGuild Gaming Cafe',
    'gaming cafe',
    'PS5 gaming',
    'racing simulator',
    'book gaming station',
    'VR gaming',
    'PlayStation 5',
    'gaming lounge',
    'online booking',
    'high-end gaming',
    'gaming cafe near me',
    'gaming cafe in kothapet'
  ],
  icons: {
    icon: '/images/logoImage.png',
    apple: '/images/logoImage.png',
  },
  openGraph: {
    title: 'EmiGuild Cafe — Book PS5 & Racing Simulator Sessions',
    description: 'Premium gaming cafe with PS5, racing simulators, and high-end gaming stations. Reserve your session online for the ultimate experience!',
    type: 'website',
    images: [
      {
        url: '/images/logoImage.png',
        alt: 'EmiGuild Cafe Logo',
      }
    ]
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          <HomeEntryProvider>
            <div data-site-chrome="header"><Navbar /></div>
            <ActivityTracker />
            <main>{children}</main>
            <div data-site-chrome="assistant">
              <Suspense fallback={null}><DeferredAssistant user={session?.user ?? null} /></Suspense>
            </div>
          </HomeEntryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

async function DeferredAssistant({ user }: { user: object | null }) {
  try {
    return await canUseAssistant(user) ? <EmiAssistant /> : null;
  } catch (error) {
    console.error('Assistant availability lookup failed:', error);
    return null;
  }
}
