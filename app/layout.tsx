import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 're·roll: peer-to-peer tickets', template: '%s · re·roll' },
  description: 'Peer-to-peer ticket marketplace. Buy and sell tickets directly with other fans, with capped prices and escrow protection.',
};
export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="wordmark" aria-label="re·roll home">re<i>·</i>roll</Link>
            <nav aria-label="Primary" style={{ display: 'flex', gap: 16 }}>
              <Link href="/" className="tag">Events</Link>
              <Link href="/sell" className="tag">Sell</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer>
          <div className="wrap">re·roll is an independent peer-to-peer marketplace, not affiliated with event organizers or ticketing companies. Resale prices are capped and payments are held in escrow.</div>
        </footer>
      </body>
    </html>
  );
}
