import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { auth } from '@/auth';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { InstallBanner } from '@/components/pwa/InstallBanner';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B1220',
};

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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EmiGuild',
  },
  openGraph: {
    title: 'EmiGuild Cafe — Book PS5 & Racing Simulator Sessions',
    description: 'Premium gaming cafe with PS5, racing simulators, and high-end gaming stations. Reserve your session online for the ultimate experience!',
    type: 'website',
    siteName: 'EmiGuild Gaming Cafe',
    images: [
      {
        url: '/images/logoImage.png',
        alt: 'EmiGuild Cafe Logo',
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EmiGuild Gaming Cafe — PS5 & Racing Simulator Booking',
    description: 'Premium gaming cafe with PS5, racing simulators, and high-end gaming stations. Reserve your session online!',
    images: ['/images/logoImage.png'],
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
          <InstallBanner />
          <ServiceWorkerRegistrar />
        </SessionProvider>
      </body>
    </html>
  );
}
