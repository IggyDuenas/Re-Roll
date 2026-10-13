import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="narrow" style={{ textAlign: 'center', paddingTop: 48 }}>
      <h1>Nothing here</h1>
      <p className="meta" style={{ margin: '12px 0 24px' }}>
        This page doesn&apos;t exist. If you were opening a ticket link, that ticket may have been re-rolled and sold to someone else.
      </p>
      <Link className="btn" href="/">Browse events</Link>
    </div>
  );
}
