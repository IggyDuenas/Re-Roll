import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 're·roll: tickets that never cost more', template: '%s · re·roll' },
  description: "Buy tickets to live events. Can't go? Re-roll your ticket: it goes back on sale at face value and moves to the next fan. No markups, ever.",
};
export const viewport: Viewport = { themeColor: '#0a0a0f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="wordmark" aria-label="re·roll home">re<i>·</i>roll</Link>
            <nav aria-label="Primary"><Link href="/" className="tag">Events</Link></nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer>
          <div className="wrap">re·roll. Face value in, face value out. Tickets are never resold above price.</div>
        </footer>
      </body>
    </html>
  );
}
