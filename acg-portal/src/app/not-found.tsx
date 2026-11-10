import Link from 'next/link';

export const dynamic = 'force-dynamic';

// App Router not-found boundary. Also stops Next from falling back to the
// pages-router error page during the production build.
export default function NotFound() {
  return (
    <div className="authBackdrop">
      <div style={{ width: 424, maxWidth: '94vw', textAlign: 'center' }}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: '.24em', color: '#c8a878' }}>
          AMSTERDAM CAPITAL GROUP
        </div>
        <div style={{ marginTop: 18, fontSize: '2.4rem', fontWeight: 800, color: '#fff' }}>404</div>
        <p style={{ marginTop: 10, fontSize: '.9rem', color: '#9fb0cc', lineHeight: 1.6 }}>
          That page could not be found.
        </p>
        <Link className="btnPrimary" href="/" style={{ display: 'inline-block', marginTop: 22, padding: '11px 22px', borderRadius: 10 }}>
          Return to sign in
        </Link>
      </div>
    </div>
  );
}
