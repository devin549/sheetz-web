'use client';

import { useState, useTransition } from 'react';
import { approveEstimate, askQuestion, requestDeposit, declineEstimate, chooseTier, joinClogClub } from './actions';
import SignaturePad from './SignaturePad';
import { memberOffer } from '@/lib/memberSavings';
import { financingOffer } from '@/lib/financing';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
// Hardcoded-dark page (#0e0f12 bg) → ALL text is hardcoded-LIGHT so it never washes out in daylight on the
// iPad. CB amber brand; green = value/GO; warm tones only for honest loss-framing, never to scare.
const AMBER = '#ffb300', GOLD = '#ffce5a', GREEN = '#3fb56a', GREEN_INK = '#06210f';
const RED = '#ff7a6e', RED_DIM = 'rgba(255,122,110,.85)';   // honest loss-contrast only — never to scare about CB
const SURF = '#171922', SURF2 = '#1f2230', LINE = '#2c3040', INK = '#f4f1ea', MUTE = 'rgba(244,241,234,.66)', FAINT = 'rgba(244,241,234,.5)';

// 🛡 Warranty badge styling — the LONGER the coverage, the GREENER/BOLDER, so the eye reads the upgrade as the
// warranty climbs the ladder. We grade off the months we can parse from the (already customer-safe) text;
// unparseable → a neutral amber badge so it still reads as a real guarantee. Presentation only — no data added.
function warrantyMonths(text) {
  const s = String(text || '').toLowerCase();
  if (/lifetime/.test(s)) return 999;
  // Separator may be a space OR a hyphen ("5-Year", "30-Day", "1 year").
  const yr = s.match(/(\d+(?:\.\d+)?)[\s-]*(?:year|yr)/);  if (yr) return Math.round(parseFloat(yr[1]) * 12);
  const mo = s.match(/(\d+)[\s-]*(?:month|mo)\b/);          if (mo) return parseInt(mo[1], 10);
  const dy = s.match(/(\d+)[\s-]*day/);                     if (dy) return parseInt(dy[1], 10) / 30;
  return null;
}
function warrantyBadge(text) {
  const m = warrantyMonths(text);
  // Green ramps up with coverage; short/unknown stays a calmer amber. All hardcoded-light text on a tinted chip.
  if (m == null)            return { bg: 'rgba(255,179,0,.16)',  border: 'rgba(255,179,0,.5)',  fg: GOLD };
  if (m >= 60)              return { bg: 'rgba(63,181,106,.26)', border: GREEN,                 fg: '#bff4d2', strong: true };
  if (m >= 12)              return { bg: 'rgba(63,181,106,.18)', border: 'rgba(63,181,106,.7)', fg: '#a9eec2' };
  if (m >= 2)               return { bg: 'rgba(255,206,90,.18)', border: 'rgba(255,206,90,.6)', fg: GOLD };
  return { bg: 'rgba(255,179,0,.14)', border: 'rgba(255,179,0,.45)', fg: GOLD };
}

export default function CustomerEstimate({ est }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(est.status);
  const [view, setView] = useState(null);    // 'question' | 'decline' | 'approve'
  const [text, setText] = useState('');
  const [done, setDone] = useState(null);
  const [name, setName] = useState(est.customerName || '');
  const [consent, setConsent] = useState(false);
  const [sig, setSig] = useState(null);   // drawn signature (PNG data URL) — stand-in for text-to-sign until A2P
  const [err, setErr] = useState(null);

  // The customer-facing ladder (empty on old single-tier links → flat fallback below).
  const tiers = Array.isArray(est.tiers) ? est.tiers : [];
  const hasLadder = tiers.length >= 2;
  // Pre-select the recommended tier (or the one the customer already chose) so there's always a default — the
  // compromise effect needs a center to land on.
  const initialKey = est.selectedTierKey || (tiers.find((t) => t.recommended) || tiers[1] || tiers[0] || {}).key || null;
  const [picked, setPicked] = useState(initialKey);
  const [expanded, setExpanded] = useState({});   // tierKey → bool (collapsible "what's included")
  const [clubMsg, setClubMsg] = useState(null);    // lever #3 — Clog Club interest confirmation
  const pickedTier = tiers.find((t) => t.key === picked) || null;

  // ⭐ Lever #3 — Clog Club member-savings DISPLAY on the active tier (picked → recommended → first). NEVER
  // moves the quoted price; it shows what JOINING at the EXISTING plan rate would save on this job. Tapping
  // records interest only (joinClogClub) — no auto-enroll, no auto-discount.
  const memberBaseTier = pickedTier || tiers.find((t) => t.recommended) || tiers[0] || null;
  const memberInfo = est.member && memberBaseTier ? memberOffer(memberBaseTier.subtotal, { name: est.member.name, discount_pct: est.member.discountPct }) : { show: false };
  const joinClub = () => start(async () => { try { const r = await joinClogClub(est.token); setClubMsg(r.ok ? r.msg : (r.msg || null)); } catch (_) {} });

  const act = (fn, arg) => start(async () => { setErr(null); const r = await fn(est.token, arg); if (r.ok) { setDone(r.msg); setStatus('done'); } else setErr(r.msg); });

  // Tier total drives the proof + approve when a ladder exists; otherwise the flat subtotal.
  const approveTotal = hasLadder && pickedTier ? (Number(pickedTier.subtotal) || 0) : est.subtotal;

  const approve = () => {
    if (!name.trim()) { setErr('Please type your name to approve.'); return; }
    if (!consent) { setErr('Please check the box to authorize the work.'); return; }
    if (!sig) { setErr('Please sign in the box to approve.'); return; }
    act(approveEstimate, { name: name.trim(), consent: true, signature: sig, tierKey: hasLadder ? picked : undefined });
  };
  // Choosing a tier records the choice server-side (re-points the active snapshot), then opens approve.
  const chooseAndApprove = (key) => start(async () => {
    setErr(null); setPicked(key);
    if (hasLadder) { try { await chooseTier(est.token, key); } catch (_) {} }
    setView('approve');
  });

  const closed = ['approved', 'declined', 'deposit_requested', 'question'].includes(status) || status === 'done';

  const card = { background: SURF, border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, width: '100%', maxWidth: 480, boxSizing: 'border-box', color: INK };
  const btn = (bg, color, border) => ({ width: '100%', padding: '15px', borderRadius: 12, border: border || 'none', background: bg, color, fontSize: 16, fontWeight: 800, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1 });

  // ── A single tier card. Recommended = the visual hero (raised, gold border + glow, badge, big green CTA). ──
  const TierCard = (t, idx) => {
    const hero = !!t.recommended;
    const isPicked = t.key === picked;
    const lines = Array.isArray(t.lines) ? t.lines : [];
    const photo = lines.find((l) => l.photo)?.photo || null;
    const open = !!expanded[t.key];
    return (
      <div key={t.key} style={{
        position: 'relative', borderRadius: 18, boxSizing: 'border-box', color: INK,
        background: hero ? '#221d10' : SURF,
        border: `${hero ? 2 : 1}px solid ${hero ? GOLD : (isPicked ? AMBER : LINE)}`,
        boxShadow: hero ? '0 0 0 4px rgba(255,179,0,.12), 0 10px 30px rgba(0,0,0,.45)' : 'none',
        padding: hero ? '22px 18px 18px' : '16px 16px 16px',
        transform: hero ? 'scale(1.02)' : 'none', zIndex: hero ? 2 : 1,
      }}>
        {hero && (
          /* Honest badge: "Most chosen" ONLY when real approvals back THIS tier (data-true). Otherwise the
             always-true "Recommended" — never a popularity claim that isn't in the numbers. */
          <div className="cb-recommend" style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: GOLD, color: '#2a1f00', fontSize: 11, fontWeight: 900, letterSpacing: '.04em', padding: '4px 12px', borderRadius: 20 }}>{t.mostChosen ? '★ MOST CHOSEN' : '★ RECOMMENDED'}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: hero ? 26 : 22 }}>{t.icon}</span>
          <span style={{ fontWeight: 800, fontSize: hero ? 19 : 16, color: INK }}>{t.name}</span>
        </div>
        {t.bestFor && <div style={{ fontSize: 12.5, color: MUTE, marginTop: 3 }}>{t.bestFor}</div>}

        {photo && <img src={photo} alt="" style={{ width: '100%', height: hero ? 150 : 116, objectFit: 'cover', borderRadius: 12, marginTop: 12, background: SURF2 }} />}

        {/* Outcome-first pitch (sells the feeling), not the parts list. */}
        {t.pitch && <p style={{ fontSize: hero ? 15 : 14, lineHeight: 1.5, color: INK, margin: '12px 0 0' }}>{t.pitch}</p>}

        {/* 🛡 Lever #1 — BRIGHT warranty badge; greener/bolder as coverage climbs the ladder, so the eye reads
            the upgrade. Customer-safe text only. */}
        {t.warranty && (() => { const b = warrantyBadge(t.warranty); return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '5px 11px', borderRadius: 999, background: b.bg, border: `1.5px solid ${b.border}`, color: b.fg, fontSize: 12.5, fontWeight: b.strong ? 900 : 800, letterSpacing: '.01em' }}>
            <span>🛡</span><span>{t.warranty}</span>
          </div>
        ); })()}

        {/* ❌ Lever #2 — honest loss-contrast: what this option does NOT cover. Renders ONLY when a truthful
            caveat was authored (owner/GBB builder). Red = the gap, never anxiety about CB. */}
        {t.caveat && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,122,110,.10)', border: '1px solid rgba(255,122,110,.32)' }}>
            <span style={{ color: RED, flexShrink: 0, fontWeight: 900 }}>❌</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.45, color: RED_DIM }}>{t.caveat}</span>
          </div>
        )}

        {/* What's included — collapsed by default to keep the card scannable. */}
        {lines.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setExpanded((e) => ({ ...e, [t.key]: !open }))} style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              {open ? '▾ Hide what’s included' : `▸ What’s included (${lines.length})`}
            </button>
            {open && (
              <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline', color: INK }}>
                    <span style={{ color: GREEN, flexShrink: 0 }}>✓</span>
                    <span style={{ flex: 1 }}>{l.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: hero ? 34 : 28, fontWeight: 900, color: hero ? GOLD : INK }}>{money(t.subtotal)}</span>
        </div>

        {/* 💳 Lever #4 — financing frame on the bigger tickets (Better/Best). REAL "as low as $X/mo" only when a
            partner is configured; otherwise the honest no-number prompt. Never a fabricated payment, never a
            price move — same total, just framed monthly. */}
        {t.key !== 'good' && (() => {
          const f = financingOffer(t.subtotal, est.financing || null);
          if (!f.available) return null;
          if (f.hasQuote && f.applyUrl) return (
            // Bold tappable CTA → straight to the lender's application. Monthly framing closes the big ticket.
            <a href={f.applyUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(105,240,174,.12)', border: `1px solid ${GREEN}`, textDecoration: 'none' }}>
              <span style={{ color: GREEN, fontWeight: 800, fontSize: 12.5 }}>💳 Pay monthly — as low as <span style={{ fontSize: 15, fontWeight: 900 }}>{money(f.monthly)}/mo</span><span style={{ color: MUTE, fontWeight: 600 }}> · {f.months} mo</span></span>
              <span style={{ color: GOLD, fontWeight: 900, whiteSpace: 'nowrap' }}>Apply →</span>
            </a>
          );
          if (f.hasQuote) return (
            <div style={{ marginTop: 8, fontSize: 12.5, color: GREEN, fontWeight: 700 }}>💳 As low as <span style={{ fontSize: 14, fontWeight: 900 }}>{money(f.monthly)}/mo</span><span style={{ color: MUTE, fontWeight: 600 }}> · {f.months} mo{f.partner ? ` · ${f.partner}` : ''}</span></div>
          );
          return <div style={{ marginTop: 8, fontSize: 12.5, color: MUTE, fontWeight: 600 }}>💳 Financing available — ask about low monthly payments</div>;
        })()}

        <button
          onClick={() => chooseAndApprove(t.key)}
          disabled={pending}
          style={{ width: '100%', marginTop: 12, padding: hero ? '16px' : '13px', borderRadius: 12, border: 'none', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1, fontWeight: 900, fontSize: hero ? 17 : 15, background: GREEN, color: GREEN_INK }}>
          {pending ? '…' : `Choose this — ${money(t.subtotal)}`}
        </button>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14, color: INK }}>
      {/* Brand header */}
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <div style={{ fontSize: 13, letterSpacing: '.18em', color: AMBER, fontWeight: 800 }}>CLOG BUSTERZ PLUMBING</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: INK }}>{est.headline || 'Your options'}{est.customerName ? <span style={{ color: MUTE, fontWeight: 500 }}> · {est.customerName}</span> : ''}</div>
        {est.customerDescription && <p style={{ color: MUTE, fontSize: 14, lineHeight: 1.5, margin: '8px 0 0' }}>{est.customerDescription}</p>}
      </div>

      {/* ── LADDER (Good/Better/Best on the customer's screen) ── */}
      {hasLadder && !closed && !done ? (
        <>
          {/* Loss-framing BEFORE the price — honest, generic: pay a little now or a lot later. */}
          <div style={{ ...card, background: SURF2, borderColor: LINE, padding: '14px 16px' }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: INK }}>
              <span style={{ color: GOLD, fontWeight: 800 }}>Fix it once.</span> A problem that comes back can mean another visit, more downtime, and water where it shouldn’t be. Each option below is guaranteed in writing — pick the peace of mind that’s right for you.
            </div>
          </div>

          {/* Anchor with the highest tier first so the rest reads as reasonable, then surface the hero. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 6 }}>
            {[...tiers].sort((a, b) => (b.subtotal || 0) - (a.subtotal || 0)).map((t, i) => TierCard(t, i))}
          </div>

          <div style={{ textAlign: 'center', fontSize: 12.5, color: MUTE, marginTop: 2 }}>
            {(() => {
              // Honest framing: claim "most customers choose" ONLY when a tier is data-backed (mostChosen);
              // otherwise the always-true "We recommend". Never a popularity claim without the count behind it.
              const chosen = tiers.find((t) => t.mostChosen);
              const rec = tiers.find((t) => t.recommended) || {};
              return chosen
                ? <>Most customers choose <strong style={{ color: GOLD }}>{chosen.name}</strong>. </>
                : <>We recommend <strong style={{ color: GOLD }}>{rec.name || 'the middle option'}</strong>. </>;
            })()}
            No pressure — choosing just records your estimate; nothing is charged until you approve.
          </div>

          {/* ⭐ Lever #3 — Clog Club member-savings banner. Honest DISPLAY of the existing plan rate on the
              active tier; tapping records interest (no auto-enroll / no auto-discount / no price move). */}
          {memberInfo.show && (
            clubMsg ? (
              <div style={{ ...card, background: 'rgba(63,181,106,.10)', borderColor: GREEN, padding: '13px 15px', textAlign: 'center' }}>
                <div style={{ fontSize: 13.5, color: '#bff4d2', fontWeight: 700, lineHeight: 1.5 }}>⭐ {clubMsg}</div>
              </div>
            ) : (
              <button onClick={joinClub} disabled={pending} style={{ width: '100%', textAlign: 'left', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1, background: 'linear-gradient(180deg, rgba(63,181,106,.16), rgba(63,181,106,.07))', border: `1.5px solid ${GREEN}`, borderRadius: 14, padding: '14px 16px', color: INK }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>⭐</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: 15, color: INK }}>Join the {memberInfo.planName} — save <span style={{ color: GREEN }}>{money(memberInfo.savings)}</span> on this job</div>
                    <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>{memberInfo.discountPct}% off this visit + every visit after.{est.member?.monthlyPrice ? ` Just ${money(est.member.monthlyPrice)}/mo.` : ''} Tap to hear how — nothing changes on this estimate.</div>
                  </div>
                  <span style={{ color: GREEN, fontWeight: 900, fontSize: 18, flexShrink: 0 }}>→</span>
                </div>
              </button>
            )
          )}

          {/* Secondary actions — visually demoted under the ladder. */}
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <button onClick={() => setView('question')} disabled={pending} style={{ ...btn(SURF, INK, `1px solid ${LINE}`), fontSize: 14 }}>Ask a question</button>
            <button onClick={() => setView('decline')} disabled={pending} style={{ ...btn(SURF, FAINT, `1px solid ${LINE}`), fontSize: 14 }}>Not now</button>
          </div>
          {err && <div style={{ color: '#ff8a8a', fontSize: 13, textAlign: 'center' }}>{err}</div>}
        </>
      ) : !hasLadder && !closed && !done ? (
        /* ── FLAT FALLBACK (old single-tier links / no bundle) — unchanged behavior ── */
        <>
          {est.lines.map((l, i) => (
            <div key={i} style={card}>
              {l.photo ? (
                <img src={l.photo} alt={l.name} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 12, background: SURF2 }} />
              ) : (
                <div style={{ width: '100%', height: 110, borderRadius: 12, marginBottom: 12, background: SURF2, display: 'grid', placeItems: 'center', fontSize: 34, opacity: 0.5 }}>🔧</div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 17, flex: 1, color: INK }}>{l.name}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: AMBER }}>{money(l.price)}</div>
              </div>
              {l.description && <p style={{ color: MUTE, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' }}>{l.description}</p>}
              {l.gallery && l.gallery.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
                  {l.gallery.slice(0, 6).map((g, gi) => <img key={gi} src={g} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />)}
                </div>
              )}
              {l.warranty && <div style={{ fontSize: 12, color: MUTE, marginTop: 10 }}>🛡 {l.warranty}</div>}
              {l.pdf && <a href={l.pdf} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: AMBER, display: 'inline-block', marginTop: 8, textDecoration: 'none' }}>📄 Product details →</a>}
            </div>
          ))}

          {/* Total */}
          <div style={{ ...card, background: SURF2 }}>
            {est.lines.length > 1 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: MUTE }}><span>Subtotal</span><span>{money(est.subtotal)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: est.lines.length > 1 ? 8 : 0 }}>
              <span style={{ fontWeight: 800, fontSize: 18, color: INK }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: 26, color: AMBER }}>{money(est.subtotal)}</span>
            </div>
            {/* 🛡 Lever #1 — bright warranty badge on the flat total too. */}
            {est.warranty && (() => { const b = warrantyBadge(est.warranty); return (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '5px 11px', borderRadius: 999, background: b.bg, border: `1.5px solid ${b.border}`, color: b.fg, fontSize: 12.5, fontWeight: b.strong ? 900 : 800 }}><span>🛡</span><span>{est.warranty}</span></div>
            ); })()}
            {/* 💳 Lever #4 — financing on a big single-ticket total. */}
            {(() => { const f = financingOffer(est.subtotal, est.financing || null); if (!f.available) return null;
              return f.hasQuote
                ? <div style={{ marginTop: 10, fontSize: 12.5, color: GREEN, fontWeight: 700 }}>💳 As low as <span style={{ fontSize: 14, fontWeight: 900 }}>{money(f.monthly)}/mo</span><span style={{ color: MUTE, fontWeight: 600 }}> · {f.months} mo{f.partner ? ` · ${f.partner}` : ''}</span>{f.applyUrl && <a href={f.applyUrl} target="_blank" rel="noreferrer" style={{ color: GOLD, fontWeight: 800, textDecoration: 'none', marginLeft: 6 }}>Apply →</a>}</div>
                : <div style={{ marginTop: 10, fontSize: 12.5, color: MUTE, fontWeight: 600 }}>💳 Financing available — ask about low monthly payments</div>;
            })()}
          </div>

          {/* ⭐ Lever #3 — member-savings banner on the flat single-tier total. */}
          {(() => { const mi = est.member ? memberOffer(est.subtotal, { name: est.member.name, discount_pct: est.member.discountPct }) : { show: false }; if (!mi.show) return null;
            return clubMsg ? (
              <div style={{ ...card, background: 'rgba(63,181,106,.10)', borderColor: GREEN, padding: '13px 15px', textAlign: 'center' }}><div style={{ fontSize: 13.5, color: '#bff4d2', fontWeight: 700, lineHeight: 1.5 }}>⭐ {clubMsg}</div></div>
            ) : (
              <button onClick={joinClub} disabled={pending} style={{ width: '100%', textAlign: 'left', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1, background: 'linear-gradient(180deg, rgba(63,181,106,.16), rgba(63,181,106,.07))', border: `1.5px solid ${GREEN}`, borderRadius: 14, padding: '14px 16px', color: INK }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>⭐</span>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 900, fontSize: 15, color: INK }}>Join the {mi.planName} — save <span style={{ color: GREEN }}>{money(mi.savings)}</span> on this job</div><div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>{mi.discountPct}% off this visit + every visit after. Tap to hear how — nothing changes on this estimate.</div></div>
                  <span style={{ color: GREEN, fontWeight: 900, fontSize: 18, flexShrink: 0 }}>→</span>
                </div>
              </button>
            );
          })()}

          <div style={{ display: 'grid', gap: 10 }}>
            <button onClick={() => { setView('approve'); setErr(null); }} disabled={pending} style={btn(GREEN, GREEN_INK)}>✓ {est.approveText}</button>
            <button onClick={() => act(requestDeposit)} disabled={pending} style={btn(SURF, AMBER, `1px solid ${AMBER}`)}>💳 Put a deposit down</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setView('question')} disabled={pending} style={btn(SURF, INK, `1px solid ${LINE}`)}>Ask a question</button>
              <button onClick={() => setView('decline')} disabled={pending} style={btn(SURF, FAINT, `1px solid ${LINE}`)}>Not now</button>
            </div>
            {err && <div style={{ color: '#ff8a8a', fontSize: 13, textAlign: 'center' }}>{err}</div>}
          </div>
        </>
      ) : null}

      {/* ── Modal-ish states (approve / question / decline / closed) — shared by both layouts ── */}
      {done ? (
        <div style={{ ...card, textAlign: 'center', borderColor: GREEN }}>
          <div style={{ fontSize: 34 }}>{status === 'done' ? '✅' : '👍'}</div>
          <div style={{ fontWeight: 700, marginTop: 6, color: INK }}>{done}</div>
          {est.techName && <div style={{ color: MUTE, fontSize: 13, marginTop: 4 }}>— {est.techName}, Clog Busterz</div>}
        </div>
      ) : status === 'approved' ? (
        <div style={{ ...card, borderColor: GREEN }}>
          <div style={{ textAlign: 'center', fontSize: 34 }}>✅</div>
          <div style={{ textAlign: 'center', fontWeight: 800, marginTop: 4, color: INK }}>Approved — thank you!</div>
          {est.approvedName && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: SURF2, fontSize: 12.5, lineHeight: 1.6, color: INK }}>
              <div style={{ color: FAINT, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10, marginBottom: 4 }}>Approval on record</div>
              <div><strong>{est.approvedName}</strong> · {money(est.subtotal)}</div>
              {est.approvedAt && <div style={{ color: MUTE }}>{new Date(est.approvedAt).toLocaleString()}</div>}
              {est.consentText && <div style={{ color: MUTE, marginTop: 6, fontStyle: 'italic' }}>“{est.consentText}”</div>}
            </div>
          )}
        </div>
      ) : closed ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ color: MUTE }}>{status === 'declined' ? 'This estimate was declined.' : 'Thanks — we’ll be in touch.'}</div>
        </div>
      ) : view === 'approve' ? (
        <div style={{ ...card, borderColor: GREEN }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: INK }}>
            Approve {money(approveTotal)}{hasLadder && pickedTier ? <span style={{ color: GOLD }}> · {pickedTier.name}</span> : ''}
          </div>
          <p style={{ color: MUTE, fontSize: 13, margin: '0 0 12px' }}>Type your name to authorize the work. This is your record of approval.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoFocus
            style={{ width: '100%', boxSizing: 'border-box', background: SURF2, border: `1px solid ${LINE}`, color: INK, borderRadius: 10, padding: 13, fontSize: 16, marginBottom: 12 }} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, color: INK, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
            <span>I, <strong>{name.trim() || 'the customer'}</strong>, approve this {money(approveTotal)} estimate from Clog Busterz Plumbing and authorize the work described.</span>
          </label>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Sign to approve</div>
            <SignaturePad onChange={setSig} />
          </div>
          {err && <div style={{ color: '#ff8a8a', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setView(null); setErr(null); }} style={btn(SURF2, INK)}>Back</button>
            <button onClick={approve} disabled={pending} style={btn(GREEN, GREEN_INK)}>{pending ? '…' : '✓ Approve & Schedule'}</button>
          </div>
        </div>
      ) : view === 'question' ? (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: INK }}>Ask a question</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What would you like to know?" style={{ width: '100%', boxSizing: 'border-box', background: SURF2, border: `1px solid ${LINE}`, color: INK, borderRadius: 10, padding: 11, fontSize: 15, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setView(null)} style={btn(SURF2, INK)}>Back</button>
            <button onClick={() => act(askQuestion, text)} disabled={pending} style={btn(AMBER, '#1a1206')}>Send</button>
          </div>
        </div>
      ) : view === 'decline' ? (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: INK }}>No problem — mind sharing why?</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {['Too expensive', 'Need to think about it', 'Want a second opinion', 'Timing isn’t right'].map((r) => (
              <button key={r} onClick={() => act(declineEstimate, r)} disabled={pending} style={{ ...btn(SURF2, INK, `1px solid ${LINE}`), padding: 12, fontSize: 14, fontWeight: 600, textAlign: 'left' }}>{r}</button>
            ))}
          </div>
          <button onClick={() => setView(null)} style={{ ...btn('transparent', MUTE, 'none'), marginTop: 8, fontSize: 14 }}>Back</button>
        </div>
      ) : null}

      <div style={{ textAlign: 'center', fontSize: 11.5, color: FAINT, marginTop: 4, paddingBottom: 20 }}>
        Clog Busterz Plumbing · (859) 408-3382 · Prices held for this visit. Nothing is charged until you approve.
      </div>
    </div>
  );
}
