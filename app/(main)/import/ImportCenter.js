'use client';

// Import Center — pick a source, paste or upload a CSV, preview the column match + counts, then commit.
// One UI for every kind in lib/importKinds.js; the engine + actions do the type-specific work.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { previewKind, runKind } from './actions';

const box = { width: '100%', minHeight: 160, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, fontFamily: 'var(--mono)', lineHeight: 1.5, resize: 'vertical' };

export default function ImportCenter({ kinds = [] }) {
  const router = useRouter();
  const [kindId, setKindId] = useState(kinds[0] ? kinds[0].id : '');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, start] = useTransition();
  const kind = kinds.find((k) => k.id === kindId) || null;

  const reset = () => { setPreview(null); setResult(null); setErr(null); };
  const pickKind = (id) => { setKindId(id); reset(); };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { setCsv(String(fr.result || '')); reset(); };
    fr.readAsText(f);
  };

  const doPreview = () => { setErr(null); setResult(null); start(async () => { const r = await previewKind(kindId, csv); if (r.ok) setPreview(r); else { setPreview(null); setErr(r.msg); } }); };
  const doImport = () => {
    if (!preview) return;
    if (!window.confirm(`Import ${preview.willWrite} ${kind.label.toLowerCase()} row(s)? ${preview.mode === 'upsert' ? 'Existing rows update in place.' : 'Duplicates are skipped.'}`)) return;
    setErr(null);
    start(async () => { const r = await runKind(kindId, csv); if (r.ok) { setResult(r); setPreview(null); router.refresh(); } else setErr(r.msg); });
  };

  const chip = (on) => ({ cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 800 : 600, padding: '7px 13px', borderRadius: 20, whiteSpace: 'nowrap', border: `1px solid ${on ? 'var(--amber)' : 'var(--border)'}`, color: on ? 'var(--amber)' : 'var(--fg-2)', background: on ? 'color-mix(in oklab, var(--amber) 14%, var(--surface-2))' : 'var(--surface-2)' });

  return (
    <>
      {/* pick a source */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {kinds.map((k) => <button key={k.id} onClick={() => pickKind(k.id)} style={chip(kindId === k.id)}>{k.label}</button>)}
      </div>

      {kind && (
        <div className="card card-amber">
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{kind.blurb}</div>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
            First row = headers. We recognize: {kind.fields.map((f) => <code key={f.key} style={{ marginRight: 6 }}>{f.label}{f.required ? '*' : ''}</code>)} <span style={{ opacity: 0.7 }}>(* required)</span>
          </div>
          <textarea value={csv} onChange={(e) => { setCsv(e.target.value); reset(); }} placeholder={'Paste CSV here (copying straight from a spreadsheet works)…'} style={box} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap' }}>
            <label className="pill" style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: '1px solid var(--border-strong)', padding: '8px 12px' }}>
              📄 Choose file…<input type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doPreview} disabled={busy || !csv.trim()} className="pill" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-1)', padding: '8px 14px' }}>{busy ? '…' : '👁️ Preview'}</button>
              {preview && <button onClick={doImport} disabled={busy} className="btn">{busy ? 'Importing…' : `⬆️ Import ${preview.willWrite}`}</button>}
            </div>
          </div>

          {err && <div className="notice" style={{ marginTop: 10, color: 'var(--red)', borderColor: 'var(--red)' }}>{err}</div>}

          {result && (
            <div className="card" style={{ marginTop: 10, background: 'var(--surface-2)', borderColor: 'var(--green)' }}>
              <div style={{ fontWeight: 800, color: 'var(--green)' }}>✅ Imported {result.written} {kind.label.toLowerCase()}.</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {result.skippedExisting ? `${result.skippedExisting} already on file (skipped). ` : ''}
                {result.linked != null ? `${result.linked} linked to a customer${result.unlinked ? `, ${result.unlinked} had no match` : ''}. ` : ''}
                {result.warn ? `Note: ${result.warn}` : ''}
              </div>
            </div>
          )}

          {preview && (
            <div className="card" style={{ marginTop: 10, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
                <Stat n={preview.willWrite} label="will import" color="var(--green)" />
                <Stat n={preview.distinctKeys} label={`distinct ${preview.keyLabel}`} />
                <Stat n={preview.skipped.missingRequired + preview.skipped.noKey} label="will skip" color={(preview.skipped.missingRequired + preview.skipped.noKey) ? 'var(--amber)' : undefined} />
                <Stat n={preview.totalDataRows} label="rows seen" />
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Column match</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 4, marginBottom: 10 }}>
                {preview.mapping.map((m) => (
                  <div key={m.key} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
                    <span style={{ color: 'var(--fg-2)' }}>{m.field}{m.required ? '*' : ''}</span>
                    <span style={{ color: m.header ? 'var(--green)' : (m.required ? 'var(--red)' : 'var(--fg-3)'), fontWeight: m.header ? 700 : 400 }}>{m.header || '—'}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>First rows</div>
              <div style={{ overflowX: 'auto' }}>
                <pre style={{ fontSize: 11, fontFamily: 'var(--mono)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview.sample.map((s) => JSON.stringify(s)).join('\n')}</pre>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{preview.mode === 'upsert' ? `Re-import safe — rows update in place on ${preview.keyLabel}.` : `Re-import safe — rows already on file are skipped.`}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ n, label, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 70 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--fg-1)' }}>{n}</span>
      <span className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
    </div>
  );
}
