import type { Metadata, Viewport } from 'next';
import { Figtree, IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/providers/AppProviders';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument-serif',
});

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-figtree',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F5132',
};

export const metadata: Metadata = {
  title: 'Tallymark — Issue the receipt. Keep the book. Know your day.',
  description:
    'Issue professional receipts in seconds and keep a clean digital cash book for Nigerian small businesses.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tallymark',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Tallymark — Issue the receipt. Keep the book. Know your day.',
    description:
      'Issue professional receipts in seconds and keep a clean digital cash book for Nigerian small businesses.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tallymark — Issue the receipt. Keep the book. Know your day.',
    description:
      'Issue professional receipts in seconds and keep a clean digital cash book for Nigerian small businesses.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { url, anonKey, isConfigured } = getPublicSupabaseConfig();

  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${figtree.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans-ui antialiased selection:bg-[#0F5132]/15 selection:text-[#0F5132]">
        <AppProviders
          supabaseUrl={url}
          supabaseAnonKey={anonKey}
          isSupabaseConfigured={isConfigured}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
