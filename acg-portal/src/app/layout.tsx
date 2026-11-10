import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted Manrope (variable, weights 400–800). No external font CDN, which
// keeps us within the strict `font-src 'self'` CSP.
const manrope = localFont({
  src: './../fonts/Manrope.woff2',
  weight: '400 800',
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'ACG Investor Portal',
  description: 'Amsterdam Capital Group — private investor portal & team console.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1d3a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
