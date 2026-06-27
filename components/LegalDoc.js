// Renders a CB legal document (Handbook / NDA) from sectioned content. Plain, readable, on-theme. Used by
// the standalone /handbook and /nda routes the onboarding flow links to (so a tech can read what they sign).
export default function LegalDoc({ title, sections = [], note = '' }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 18px 64px' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 30 }}>🪠</div>
        <h1 style={{ margin: '6px 0 2px', fontSize: 24 }}>{title}</h1>
        <div className="muted" style={{ fontSize: 12 }}>Clog Busterz Plumbing · keep a copy for your records</div>
      </div>
      {note && <div className="card" style={{ borderLeft: '3px solid var(--amber)', fontSize: 12.5, marginBottom: 16 }}>{note}</div>}
      {sections.map((s, i) => (
        <section key={i} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, color: 'var(--amber-dim)', borderBottom: '1px solid var(--border)', paddingBottom: 5, marginBottom: 8 }}>{s.heading}</h2>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--fg-1)', whiteSpace: 'pre-wrap' }}>{s.body}</div>
        </section>
      ))}
    </div>
  );
}
