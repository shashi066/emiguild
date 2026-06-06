import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { auth } from '@/auth';

export const metadata: Metadata = {
  title: {
    default: 'EmiGuild Cafe — PS5 & Racing Simulator Booking',
    template: '%s | EmiGuild Cafe',
  },
  description: 
    'EmiGuild Cafe in [Your City] offers PS5, racing simulators, and premium gaming stations. Reserve your slot online for an immersive gaming experience. Walk in ready to play!',
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
          <Navbar />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
