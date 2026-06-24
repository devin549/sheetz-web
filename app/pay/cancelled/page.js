export const metadata = { title: 'Payment cancelled — Clog Busterz Plumbing' };

export default function PayCancelled() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1206', color: '#f5e9d8', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>↩️</div>
        <h1 style={{ fontSize: 26, margin: '12px 0 6px', color: '#FF8124' }}>Payment cancelled</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#d8c8b0' }}>No charge was made. If you meant to pay, just re-open the link we sent — or call <strong>Clog Busterz Plumbing</strong> and we'll help.</p>
      </div>
    </div>
  );
}
