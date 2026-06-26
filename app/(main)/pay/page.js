import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { computeWeeklyPay, CB_STRUCTURE, dollars } from '@/lib/pay';
import { nyWeekWindow, weeklyLeaderboard } from '@/lib/leaderboard';
import { marginVerdict, MARGIN_TARGET } from '@/lib/marginCoach';
import RequestAdvance from './RequestAdvance';

export const dynamic = 'force-dynamic';

const DONE = ['done', 'complete', 'completed', 'closed'];
const PAY_TYPE_LABEL = { commission: 'Commission', hourly: 'Hourly', hourly_comm: 'Hourly + commission', salary: 'Salary' };

export default async function Pay() {
  const { user, profile } = await requirePerm('seeOwnPayOnly', 'seeFinancials', 'changeStatus');
  const name = profile.name || user.email;

  // Compute the tech's REAL week from jobs + their pay profile + the CB structure. Commission techs
  // are commission-only (hourly = PTO/holiday). Award grants this week feed bonuses/deductions.
  let pay = null, structure = CB_STRUCTURE, rank = null, weekLabel = '', margins = [];
  const roastLevel = profile.roastLevel || 'PG';
  if (isAdminConfigured && profile.tech_id) {
    const sb = getSupabaseAdmin();
    const { startISO, endISO } = nyWeekWindow(new Date());
    weekLabel = new Date(startISO).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' – ' + new Date(Date.parse(endISO) - 86400000).toLocaleDateString([], { month: 'short', day: 'numeric' });
    let jobs = [], jobDetails = [];
    let jq = await sb.from('jobs').select('id, amount, status, material_cost_cents, dispatch_fee_cents, job_type, customers(name)')
      .eq('tech_id', profile.tech_id).in('status', DONE).gte('scheduled_at', startISO).lt('scheduled_at', endISO);
    if (jq.error) jq = await sb.from('jobs').select('id, amount, status, job_type, customers(name)').eq('tech_id', profile.tech_id).in('status', DONE).gte('scheduled_at', startISO).lt('scheduled_at', endISO); // pre-73
    jobs = (jq.data || []).map((j) => ({ revenue_cents: Math.round(Number(j.amount || 0) * 100), material_cost_cents: j.material_cost_cents || 0, dispatch_fee_cents: j.dispatch_fee_cents || 0 }));
    jobDetails = (jq.data || []).map((j) => ({ id: j.id, customer: (j.customers && j.customers.name) || 'Customer', type: j.job_type || 'Job', amount: Number(j.amount) || 0, materialCost: (j.material_cost_cents || 0) / 100, dispatchFee: (j.dispatch_fee_cents || 0) / 100 }));
    // Per-job margin verdict (🌽 Corn ≥target / 💩 Turd below + $ to hit it). Roast heat = the tech's level.
    margins = jobDetails.map((j) => ({ ...j, verdict: marginVerdict({ revenue: j.amount, materialCost: j.materialCost, dispatchFee: j.dispatchFee, level: roastLevel, name }) })).filter((j) => j.amount > 0);

    let prof = { pay_type: 'commission', commission_pct: 0, hourly_rate: 0, weekly_salary: 0, structure: 'cb' };
    try { const { data } = await sb.from('pay_profiles').select('*').eq('tech_id', profile.tech_id).maybeSingle(); if (data) prof = data; } catch (_) {}
    try { const { data: st } = await sb.from('pay_structures').select('*').eq('name', prof.structure || 'cb').maybeSingle(); if (st) structure = st; } catch (_) {}
    let grants = [];
    try { const { data } = await sb.from('award_grants').select('amount_cents, created_at').ilike('tech_name', name).gte('created_at', startISO).lt('created_at', endISO); grants = data || []; } catch (_) {}

    pay = computeWeeklyPay({ jobs, profile: prof, structure, grants });
    try { const lb = await weeklyLeaderboard(sb, name, Date.now()); if (lb.available && lb.you) rank = lb.you.rank; } catch (_) {}
  }

  const live = !!pay;
  const row = (ico, lbl, amt, opts = {}) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: opts.top ? '2px solid var(--amber-dim)' : '1px solid var(--border)', opacity: opts.dim ? 0.85 : 1 }}>
      <span style={{ fontSize: 16 }}>{ico}</span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: opts.strong ? 700 : 400 }}>{lbl}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: opts.neg ? 'var(--fg-3)' : opts.pos ? 'var(--green)' : 'var(--fg-1)' }}>{amt}</span>
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1" style={{ marginBottom: 2 }}>💵 My Pay{weekLabel ? ` · Week of ${weekLabel}` : ''}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
        {live ? 'Live estimate from your completed jobs + the Clog Busterz pay structure. Final pay is approved in the weekly payroll run.' : 'Connect your tech profile to see live pay. Showing the structure layout.'}
      </div>

      {!live && <div className="notice">No tech link / pay data yet — ask the office to link your login to your roster row (and run the pay structure migration).</div>}

      {live && (
        <>
          {/* HERO — real current-week gross + EWA advance */}
          <div className="card card-amber">
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Current Week · {PAY_TYPE_LABEL[pay.payType] || pay.payType}</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--amber)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.05 }}>{dollars(pay.gross)}</div>
            <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>Gross (pre-tax) · {pay.jobsCount} job{pay.jobsCount === 1 ? '' : 's'} · {dollars(pay.revenue)} revenue run{rank ? ` · rank #${rank}` : ''}</div>
            {!pay.materialEntered && pay.jobsCount > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--amber)', background: 'rgba(255,179,0,.08)', border: '1px solid var(--amber-dim)', borderRadius: 8, padding: '7px 10px' }}>
                ⚠ Material cost isn’t entered on these jobs yet — commission is shown <strong>before</strong> material deductions, so it may read high. Enter material per job for exact pay.
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--amber-dim)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 10, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>💰 Earned this week</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{dollars(pay.gross)}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>Advance available after payroll approves · routes to OM</div>
              </div>
              <RequestAdvance available={dollars(Math.round(pay.gross * 0.3))} />
            </div>
          </div>

          {/* 3 STAT CARDS — real */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
            {[
              { h: 'Pay Type', v: PAY_TYPE_LABEL[pay.payType] || pay.payType, d: pay.rate ? `${pay.rate}% commission` : 'rate set in payroll', small: true },
              { h: 'Jobs This Week', v: String(pay.jobsCount), d: `${dollars(pay.revenue)} revenue`, dc: 'var(--fg-3)' },
              { h: 'Rank', v: rank ? `#${rank}` : '—', d: 'this week', dc: '#58a6ff' },
            ].map((c) => (
              <div key={c.h} className="card" style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.h}</div>
                <div style={{ fontWeight: 800, fontSize: c.small ? 15 : 22, marginTop: 4, fontFamily: c.small ? undefined : "'JetBrains Mono', monospace" }}>{c.v}</div>
                <div style={{ fontSize: 11, color: c.dc || 'var(--fg-3)', marginTop: 2 }}>{c.d}</div>
              </div>
            ))}
          </div>

          {/* EARNINGS BREAKDOWN — real, the Clog Busterz formula */}
          <div className="card" style={{ marginTop: 12 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Earnings Breakdown · how the pay is built</h3>
            {row('📈', `Revenue collected (${pay.jobsCount} jobs)`, dollars(pay.revenue), { strong: true, top: true })}
            {pay.dispatchFees > 0 && row('🏷', 'Less dispatch fees ($125/job cap)', '−' + dollars(pay.dispatchFees), { neg: true })}
            {pay.materialDeduction > 0 && row('🔧', 'Less material at markup (2× ≤$399 · 1.5× >$399)', '−' + dollars(pay.materialDeduction), { neg: true })}
            {['commission', 'hourly_comm'].includes(pay.payType) && row('💪', `Commission (${pay.rate}% of subtotal)`, dollars(pay.commission), { strong: true })}
            {pay.premium > 0 && row('🎁', 'Material premium (10% ≤$399 · 5% >$399)', dollars(pay.premium), { pos: true })}
            {pay.hourlyJobPay > 0 && row('⏱', 'Hourly (hours × rate)', dollars(pay.hourlyJobPay))}
            {pay.salaryBase > 0 && row('🗓', 'Weekly salary', dollars(pay.salaryBase))}
            {pay.ptoPay > 0 && row('🌴', 'PTO / holiday (hourly base)', dollars(pay.ptoPay))}
            {pay.bonuses > 0 && row('🏆', 'Awards / bonuses', dollars(pay.bonuses), { pos: true })}
            {pay.deductions < 0 && row('⚖️', 'Deductions (callbacks / doc-fraud / holds)', dollars(pay.deductions), { neg: true })}
            {row('💵', 'Gross this week (pre-tax)', dollars(pay.gross), { strong: true, top: true })}
            <div className="muted" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.5 }}>
              Commission techs are commission-only — the hourly base is PTO/holiday pay, never stacked on job time. Structure: {structure.label || 'Clog Busterz'}. Final pay is approved in the weekly payroll run.
            </div>
          </div>

          {/* 📊 PER-JOB MARGIN — 🟢 Crown territory ≥target / 🔴 below + $ to hit it (lib/marginCoach) */}
          {(() => {
            const judged = margins.filter((m) => m.verdict);
            const corns = judged.filter((m) => m.verdict.tier === 'corn');
            const turds = judged.filter((m) => m.verdict.tier === 'turd');
            const unjudged = margins.filter((m) => !m.verdict);
            if (!margins.length) return null;
            return (
              <>
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Per-job margin · this week</h3>
                    <span className="pill" style={{ fontSize: 9.5, color: 'var(--green)' }}>🌽 {corns.length}</span>
                    <span className="pill" style={{ fontSize: 9.5, color: 'var(--red)' }}>💩 {turds.length}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>🟢 GREEN ≥{MARGIN_TARGET}% = Crown territory (Corn bonus). 🔴 RED below — with the $ to get there.</div>
                  <div style={{ display: 'grid', gap: 5 }}>
                    {judged.map((m) => {
                      const corn = m.verdict.tier === 'corn';
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: 'var(--surface-2)', borderLeft: `3px solid ${corn ? 'var(--green)' : 'var(--red)'}` }}>
                          <span style={{ fontSize: 14 }}>{corn ? '🟢' : '🔴'}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{m.customer}{m.type ? ` · ${m.type}` : ''} <span className="muted">· {dollars(Math.round(m.amount * 100))}</span></span>
                          <span style={{ fontWeight: 800, fontSize: 12.5, color: corn ? 'var(--green)' : 'var(--red)' }}>{m.verdict.pct}%{!corn && m.verdict.action ? ` · ${m.verdict.action.match(/\+\$[\d,]+/)?.[0] || ''}` : ''}</span>
                        </div>
                      );
                    })}
                    {unjudged.map((m) => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: 'var(--surface-2)' }}>
                        <span style={{ fontSize: 14 }}>⚪</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{m.customer}{m.type ? ` · ${m.type}` : ''} <span className="muted">· {dollars(Math.round(m.amount * 100))}</span></span>
                        <span className="muted" style={{ fontSize: 11 }}>enter material cost</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 🌽👑 / 💩🏆 CORN + TURD PAY COACH — praise the greens, roast the reds (lib/marginCoach + roast level) */}
                {(corns.length > 0 || turds.length > 0) && (
                  <div className="card" style={{ marginTop: 12, borderTop: '2px solid var(--amber)' }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>🌽👑 Corn + 💩🏆 Turd · Pay Coach</h3>
                    {corns.length > 0 && (
                      <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(76,175,80,.08)', border: '1px solid var(--green)', marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 12.5 }}>🌽👑 Corn Crown — what you killed</div>
                        <div style={{ fontSize: 12, marginTop: 3 }}>{corns.length} job{corns.length > 1 ? 's' : ''} in Crown territory ({corns.map((c) => `${c.customer} ${c.verdict.pct}%`).slice(0, 3).join(' · ')}). That’s the Corn bonus zone — keep stacking these.</div>
                      </div>
                    )}
                    {turds.length > 0 && (
                      <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(239,83,80,.08)', border: '1px solid var(--red)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: 12.5 }}>💩🏆 Golden Turd — what bled profit</div>
                        {turds.slice(0, 3).map((t) => (
                          <div key={t.id} style={{ fontSize: 12, marginTop: 4 }}><strong>{t.customer} ({t.verdict.pct}%)</strong> — {t.verdict.body} {t.verdict.action}</div>
                        ))}
                        <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Roast level: {roastLevel} · set in Settings · never shown to customers.</div>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
