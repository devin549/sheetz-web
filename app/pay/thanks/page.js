export const metadata = { title: 'Payment received — Clog Busterz Plumbing' };

export default function PayThanks() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1206', color: '#f5e9d8', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <h1 style={{ fontSize: 26, margin: '12px 0 6px', color: '#FF8124' }}>Payment received</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#d8c8b0' }}>Thank you! Your payment to <strong>Clog Busterz Plumbing</strong> went through. A receipt is on its way to your email. We appreciate your business. 🪠</p>
      </div>
    </div>
  );
}
