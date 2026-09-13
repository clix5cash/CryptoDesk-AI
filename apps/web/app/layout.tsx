import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'CryptoDesk AI — Bounded crypto intelligence architecture',
  description:
    'An open-source, multi-package crypto intelligence architecture with explicit trust, authority, and execution boundaries.',
  openGraph: {
    title: 'CryptoDesk AI',
    description: 'Open-source crypto intelligence with non-authoritative AI and bounded execution.',
    siteName: 'CryptoDesk AI',
    type: 'website',
  },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#070b12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
