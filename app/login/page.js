import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function login(formData) {
  'use server';
  const pw = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/');
  const safeNext = next.startsWith('/') ? next : '/';

  if (pw && process.env.SITE_PASSWORD && pw === process.env.SITE_PASSWORD) {
    cookies().set('cb_gate', process.env.COOKIE_TOKEN || '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    redirect(safeNext);
  }
  redirect('/login?error=1' + (safeNext !== '/' ? '&next=' + encodeURIComponent(safeNext) : ''));
}

export default function Login({ searchParams }) {
  const error = searchParams?.error;
  const next = searchParams?.next || '/';

  const input = {
    width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)',
    border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '13px 14px',
    borderRadius: 9, fontSize: 16, outline: 'none', marginBottom: 12,
  };

  return (
    <div className="wrap" style={{ maxWidth: 380, marginTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 46 }}>🚐</div>
        <div className="h1" style={{ margin: '4px 0' }}>Sheetz</div>
        <div className="muted">Clog Busterz · staff only</div>
      </div>

      <form action={login} className="card card-amber">
        <input type="hidden" name="next" value={next} />
        <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Staff password</label>
        <input name="password" type="password" autoFocus autoComplete="current-password" placeholder="••••••••" style={input} />
        {error && (
          <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>Wrong password — try again.</div>
        )}
        <button className="btn" type="submit" style={{ width: '100%', padding: 14 }}>Sign in →</button>
      </form>

      <div className="muted" style={{ textAlign: 'center', marginTop: 14, fontSize: 11 }}>
        Interim staff password. Per-person logins + 2-step verification coming next.
      </div>
    </div>
  );
}
