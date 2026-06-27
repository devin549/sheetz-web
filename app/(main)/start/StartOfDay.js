'use client';

// Start of Day — the tech's personal AI briefing before My Day. 7 sections: Welcome Back (with rank
// celebration FX), Last-Shift Scorecard, Hank's Coach/Roast (live tone dial, PRIVATE to the tech),
// Today's Briefing, Rankings, Win Condition, and the "I know today's plan" acknowledgement that routes
// to My Day. iPad-first: cream/gold, compact, big tap targets, fun badges, no wasted space.
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveShift, coachText } from './actions';
import { coachMessage, TONES, tonesForLevel } from '@/lib/roast';
import { rankChip } from '@/lib/rankFx';
import RankFx from '../RankFx';
import SodGate from './SodGate';
import { CircleCheck, Circle } from 'lucide-react';

const usd0 = (n) => '$' + Math.round(Number(n || 0)).toLocaleString();

function Tile({ label, value, tone = 'mid', hint }) {
  const col = tone === 'good' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--amber)' : 'var(--fg-1)';
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 9.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 19, fontWeight: 800, color: col, marginTop: 3 }}>{value}</div>
      {hint && <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

function RankRow({ label, chip }) {
  // Punchier rank card: a medal for the podium, a tone-tinted background + left accent, big mono rank.
  const accent = chip.tone === 'king' ? '#ffd24a' : chip.tone === 'podium' ? 'var(--green-bright, #46c178)' : chip.tone === 'basement' ? '#ff8a65' : 'var(--fg-3)';
  const medal = chip.rank === 1 ? '🥇' : chip.rank === 2 ? '🥈' : chip.rank === 3 ? '🥉' : null;
  const tinted = chip.tone !== 'mid' && chip.rank != null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, borderLeft: `4px solid ${accent}`,
      border: `1px solid ${tinted ? accent : 'var(--border)'}`, borderLeftWidth: 4,
      background: tinted ? `color-mix(in oklab, ${accent} 13%, var(--surface-2))` : 'var(--surface-2)' }}>
      <span style={{ fontSize: 17, minWidth: 22, textAlign: 'center' }}>{medal || '📊'}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-1)', flex: 1 }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 15, color: accent }}>{chip.txt}</span>
    </div>
  );
}

export default function StartOfDay({ name, lastWorked, scorecard, rankings, fieldSize, overallRank, fx, jobs = [], win, onCall, saved, roastLevel = 'PG', sodGate = null, bounties = [], challenges = [], pp = null, leaveBy = null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const allowedTones = tonesForLevel(roastLevel);
  const savedTone = saved?.flags?.tone;
  const [tone, setTone] = useState(allowedTones.includes(savedTone) ? savedTone : (allowedTones.includes('coach') ? 'coach' : allowedTones[allowedTones.length - 1]));
  const [checks, setChecks] = useState(() => (saved && saved.checklist) || {});
  const [showCheck, setShowCheck] = useState(false);
  const first = String(name || 'Tech').trim().split(/\s+/)[0];

  // Instant deterministic line, then live-Claude swaps in when it returns (fails soft → keep deterministic).
  const det = useMemo(() => coachMessage({ name, tone, scorecard, level: roastLevel }), [name, tone, scorecard, roastLevel]);
  const [ai, setAi] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAi(null); setAiThinking(true);
    coachText({ scorecard, tone }).then((r) => { if (!cancelled) { setAi(r && r.body ? r : null); setAiThinking(false); } }).catch(() => { if (!cancelled) setAiThinking(false); });
    return () => { cancelled = true; };
  }, [tone, scorecard]);
  const coach = ai || det;
  const sc = scorecard || {};
  const welcomeBack = (lastWorked?.daysOff || 0) >= 1;

  // Readiness checklist (kept from the old SOD — folded under the acknowledge).
  const ITEMS = [
    { key: 'truck', label: 'Truck fueled & stocked' },
    { key: 'tools', label: 'Tools checked — nothing missing' },
    { key: 'crew', label: 'Helper confirmed (or solo)' },
    ...(onCall ? [{ key: 'oncall', label: `On-call acknowledged — ${onCall}` }] : []),
  ];
  const toggle = (k) => setChecks((c) => ({ ...c, [k]: !c[k] }));

  const acknowledge = () => start(async () => {
    await saveShift('sod', checks, true, { rank: overallRank, tone }, '');
    router.push('/my-day');
  });

  const sub = fx?.sub;
  const kingClass = fx?.tier === 'king' ? 'cb-bob' : fx?.tier === 'basement' ? 'cb-wobble' : '';
  const ringColor = fx?.tier === 'king' ? '#ffd24a' : fx?.tier === 'basement' ? '#c98a2a' : 'var(--amber)';

  return (
    <div className="wrap" style={{ maxWidth: 660 }}>

      {/* 1 · WELCOME BACK — hero with rank celebration */}
      <div className="card cb-king-card" style={{ position: 'relative', overflow: 'hidden', border: `2px solid ${ringColor}`,
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 18%, var(--surface-1)) 0%, var(--amber-deep) 100%)' }}>
        <RankFx fireworks={fx?.fx === 'fireworks'} confetti={fx?.fx === 'confetti' || fx?.comebackExtra} />
        <div style={{ position: 'relative', zIndex: 6, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className={`cb-pop ${kingClass}`} style={{ fontSize: 46, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))' }}>{fx?.badge || '🌅'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              {welcomeBack ? `Welcome back · ${lastWorked.daysOff + 1} days out` : 'Start of Day'}
            </div>
            <div style={{ fontSize: 23, fontWeight: 800 }}>{welcomeBack ? `Welcome back, ${first}.` : `Good morning, ${first}.`}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              {lastWorked?.pretty ? `Last shift: ${lastWorked.pretty}` : 'Your first tracked shift — make the first number a good one.'}
            </div>
          </div>
          {overallRank ? (
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div className="cb-glow" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 30, fontWeight: 800, color: ringColor }}>#{overallRank}</div>
              <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>of {fieldSize}</div>
            </div>
          ) : null}
        </div>
        <div style={{ position: 'relative', zIndex: 6, display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#1a1206', background: ringColor, padding: '3px 10px', borderRadius: 20 }}>{fx?.label || 'On the board'}</span>
          {fx?.comebackLabel && <span className="cb-pop" style={{ fontSize: 11, fontWeight: 800, color: 'var(--green-bright)', background: 'color-mix(in oklab, var(--green) 20%, var(--surface-1))', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--green)' }}>{fx.comebackLabel}</span>}
          {sub && <span style={{ fontSize: 12, color: 'var(--fg-2)', fontWeight: 600 }}>{sub}</span>}
        </div>
      </div>

      {/* 1.5 · 🚗 LEAVE-BY — the most time-sensitive number of the morning */}
      {leaveBy && (
        <div className="card" style={{ marginTop: 12, border: `2px solid ${leaveBy.late ? 'var(--red)' : 'var(--green)'}`,
          background: `linear-gradient(135deg, color-mix(in oklab, ${leaveBy.late ? 'var(--red)' : 'var(--green)'} 16%, var(--surface-1)) 0%, var(--surface-1) 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🚗</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, color: leaveBy.late ? 'var(--red)' : 'var(--green)' }}>
                {leaveBy.late ? '⚠ Leave NOW to make it' : `Leave by`}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.1 }}>
                {leaveBy.leaveTime}
                {!leaveBy.late && Number.isFinite(leaveBy.minsUntil) && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)', marginLeft: 8 }}>· in {leaveBy.minsUntil} min</span>}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>to make <strong>{leaveBy.customer}</strong>’s {leaveBy.window} window · {leaveBy.driveMin} min drive + {leaveBy.buffer} min buffer</div>
            </div>
          </div>
        </div>
      )}

      {/* 2 · LAST SHIFT SCORECARD */}
      <div style={{ marginTop: 12 }}>
        <SectionLabel>📊 Last Shift Scorecard{sc.available ? ` · ${jobs.length ? '' : ''}${sc.jobs} job${sc.jobs === 1 ? '' : 's'}` : ''}</SectionLabel>
        {sc.available ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(98px, 1fr))', gap: 8 }}>
            <Tile label="Revenue" value={usd0(sc.revenue)} tone="good" />
            <Tile label="Avg Ticket" value={sc.avgTicket != null ? usd0(sc.avgTicket) : '—'} tone={sc.avgTicket >= 650 ? 'good' : 'warn'} hint="target $650" />
            <Tile label="Conversion" value={sc.conversion != null ? `${sc.conversion}%` : '—'} tone={sc.conversion == null ? 'mid' : sc.conversion >= 50 ? 'good' : 'warn'} hint={sc.conversion == null ? 'no estimates' : 'target 50%'} />
            <Tile label="Review" value={sc.reviewRating != null ? `${sc.reviewRating.toFixed(1)}★` : 'soon'} tone="mid" hint={sc.reviewRating == null ? 'feed pending' : ''} />
            <Tile label="On-Time" value={sc.onTimePct != null ? `${sc.onTimePct}%` : '—'} tone={sc.onTimePct == null ? 'mid' : sc.onTimePct >= 95 ? 'good' : 'bad'} />
            <Tile label="Photo QA" value={`${sc.photoQa.pass}✓ / ${sc.photoQa.fail}✗`} tone={sc.photoQa.fail ? 'warn' : 'good'} />
            <Tile label="Callbacks" value={`${sc.callbacks}`} tone={sc.callbacks ? 'bad' : 'good'} />
            <Tile label="Closeout" value={sc.closeoutPct != null ? `${sc.closeoutPct}%` : '—'} tone={sc.closeoutPct == null ? 'mid' : sc.closeoutPct >= 100 ? 'good' : 'warn'} />
          </div>
        ) : (
          <div className="card"><span className="muted" style={{ fontSize: 12.5 }}>No scored shift yet — today writes the first page of your scorecard.</span></div>
        )}
      </div>

      {/* 3 · HANK COACH / ROAST (private) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <SectionLabel inline>🔧 Hank's word</SectionLabel>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: 'var(--fg-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 20 }}>🔒 PRIVATE TO YOU</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {TONES.map((t) => {
            const locked = !allowedTones.includes(t.id);
            return (
              <button key={t.id} onClick={() => !locked && setTone(t.id)} disabled={locked}
                title={locked ? `Raise your roast level in Settings to unlock ${t.label}` : t.blurb}
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 20, cursor: locked ? 'not-allowed' : 'pointer',
                  border: '1px solid ' + (tone === t.id ? 'var(--amber)' : 'var(--border-strong)'),
                  background: tone === t.id ? 'var(--amber)' : 'var(--surface-2)', color: tone === t.id ? '#1a1206' : 'var(--fg-2)', opacity: locked ? 0.45 : 1 }}>
                {locked ? '🔒 ' : `${t.emoji} `}{t.label}
              </button>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 10, marginTop: -2, marginBottom: 8 }}>Roast level <strong style={{ color: 'var(--amber)' }}>{roastLevel}</strong> — set it in <a href="/account">Settings</a> (locks after you pick).</div>
        <div className="card" style={{ borderLeft: `3px solid ${coach.clean ? 'var(--green)' : 'var(--amber)'}`, background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 7%, var(--surface-1)) 0%, var(--surface-1) 100%)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{coach.emoji} {coach.headline}</span>
            {ai && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--purple)', background: 'color-mix(in oklab, var(--purple) 16%, var(--surface-1))', border: '1px solid var(--purple)', padding: '1px 6px', borderRadius: 20 }}>✨ LIVE</span>}
            {aiThinking && !ai && <span style={{ fontSize: 9, color: 'var(--fg-3)' }}>Hank’s thinking…</span>}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg-1)' }}>{coach.body}</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, background: 'color-mix(in oklab, var(--amber) 12%, var(--surface-2))', border: '1px solid var(--amber-dim)' }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}><span style={{ color: 'var(--amber)' }}>Today: </span>{coach.action}</span>
          </div>
        </div>
      </div>

      {/* 4 · TODAY'S BRIEFING */}
      <div style={{ marginTop: 14 }}>
        <SectionLabel>📋 Today's Briefing · {jobs.length} job{jobs.length === 1 ? '' : 's'}</SectionLabel>
        {jobs.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {jobs.map((j) => (
              <div key={j.id} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, color: 'var(--amber)', fontSize: 14 }}>{j.time}</span>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{j.customer}</span>
                  {j.number ? <span className="muted" style={{ fontSize: 11 }}>#{j.number}</span> : null}
                  <span className="pill" style={{ marginLeft: 'auto', fontSize: 10, color: j.opportunity.tone === 'gold' ? 'var(--amber)' : 'var(--green)' }}>💰 {j.opportunity.label}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{j.type}{j.address ? <> · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}`} target="_blank" rel="noreferrer">{j.address}</a></> : ''}</div>
                {j.flags.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
                    {j.flags.map((t) => (
                      <span key={t.key} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 7,
                        background: t.tone === 'red' ? 'rgba(239,83,80,.14)' : t.tone === 'orange' ? 'rgba(255,138,61,.14)' : t.tone === 'blue' ? 'rgba(88,166,255,.14)' : t.tone === 'green' ? 'rgba(70,193,120,.14)' : 'rgba(255,179,0,.14)',
                        color: t.tone === 'red' ? 'var(--red)' : t.tone === 'orange' ? '#ff8a3d' : t.tone === 'blue' ? '#58a6ff' : t.tone === 'green' ? 'var(--green)' : 'var(--amber)' }}>{t.label}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7, fontSize: 11, color: 'var(--fg-3)' }}>
                  🧰 {j.tools.slice(0, 4).join(' · ')}
                </div>
                {(j.notes || j.access) && <div className="muted" style={{ fontSize: 11.5, marginTop: 5, fontStyle: 'italic' }}>📝 {[j.access, j.notes].filter(Boolean).join(' — ')}</div>}
                <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 700 }}><span style={{ color: 'var(--amber)' }}>Best move: </span>{j.bestAction}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card"><span className="muted" style={{ fontSize: 12.5 }}>No jobs on the board yet — dispatch may still be loading your day.</span></div>
        )}
      </div>

      {/* 5 · RANKINGS */}
      {rankings && (
        <div style={{ marginTop: 14 }}>
          <SectionLabel>🏆 Where you rank{fieldSize ? ` · ${fieldSize} techs` : ''}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 7 }}>
            <RankRow label="Revenue" chip={rankChip(rankings.revenue.rank, rankings.revenue.total)} />
            <RankRow label="Average ticket" chip={rankChip(rankings.avgTicket.rank, rankings.avgTicket.total)} />
            <RankRow label="On-time" chip={rankChip(rankings.onTime.rank, rankings.onTime.total)} />
            <RankRow label="Conversion" chip={rankChip(rankings.conversion.rank, rankings.conversion.total)} />
            <RankRow label="Photo QA" chip={rankChip(rankings.photoQa.rank, rankings.photoQa.total)} />
            <RankRow label="Callback rate" chip={rankChip(rankings.callback.rank, rankings.callback.total)} />
          </div>
        </div>
      )}

      {/* 6 · WIN CONDITION */}
      <div className="card" style={{ marginTop: 14, border: '2px solid var(--amber)', background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 16%, var(--surface-1)) 0%, var(--surface-1) 100%)', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>🎯 Today's Win Condition</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginTop: 5, lineHeight: 1.45 }}>{win}</div>
      </div>

      {/* 6.5 · WEEKLY CHALLENGES · LIVE BOUNTIES — the chase list, matching the HTML arcade card
          (purple #e1bee7 / #ba68c8 accents on a dark plum gradient). The Power Plunger pull now lives in
          the TOP RIBBON next to Power Plunger Hour (HTML rail parity). */}
      {(challenges.length > 0 || bounties.length > 0) && (
        <div style={{ marginTop: 14 }}>
          <div style={{ borderRadius: 14, padding: '13px 16px', marginBottom: 2,
            background: 'linear-gradient(135deg, #3a2450 0%, #1f1430 100%)', border: '2px solid #ba68c8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>⚡</span>
              <strong style={{ color: '#e1bee7', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em' }}>Weekly Challenges · Live Bounties</strong>
              <span style={{ marginLeft: 'auto', background: '#ba68c8', color: '#fff', padding: '1px 8px', borderRadius: 9, fontSize: 9, fontWeight: 800 }}>{challenges.length + bounties.length} active</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {/* weekly challenges with progress — amber chase tiles inside the plum card */}
              {challenges.map((c) => (
                <div key={c.title} style={{ background: 'rgba(255,179,0,0.08)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{c.icon}</span>
                    <strong style={{ color: 'var(--amber)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.title}</strong>
                    <span style={{ marginLeft: 'auto', background: 'var(--amber)', color: '#1a1206', padding: '1px 7px', borderRadius: 8, fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{c.prize}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#e8dcef', marginBottom: 6 }}>{c.desc}</div>
                  <div style={{ background: 'rgba(0,0,0,0.32)', borderRadius: 5, padding: '6px 9px', fontSize: 11, fontWeight: 800, color: '#ffd24a' }}>{c.progress}</div>
                </div>
              ))}
              {/* office-posted live bounties — purple #e1bee7 accent tiles */}
              {bounties.map((b) => (
                <div key={b.id} style={{ background: 'rgba(186,104,200,0.1)', border: '1px solid #ba68c8', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{b.icon || '🎯'}</span>
                    <strong style={{ color: '#e1bee7', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{b.title}</strong>
                    {(b.amount_cents != null || b.points != null) && <span style={{ marginLeft: 'auto', background: '#ba68c8', color: '#fff', padding: '1px 7px', borderRadius: 8, fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{[b.amount_cents != null ? '+$' + Math.round(b.amount_cents / 100) : '', b.points != null ? `${b.points} XP` : ''].filter(Boolean).join(' · ')}</span>}
                  </div>
                  {b.description && <div style={{ fontSize: 11.5, color: '#e8dcef' }}>{b.description}</div>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: '#c2b0cf', marginTop: 8, textAlign: 'center' }}>
              ⚡ Devin fires new bounties anytime · 🎰 grab a Power Plunger pull from the top ribbon · full race on 🏁 Races.
            </div>
          </div>
        </div>
      )}

      {/* 7 · ACKNOWLEDGE */}
      <div style={{ marginTop: 14 }}>
        <button onClick={() => setShowCheck((v) => !v)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
          {showCheck ? '▾' : '▸'} Pre-roll check {ITEMS.every((i) => checks[i.key]) ? '✅' : `(${ITEMS.filter((i) => !checks[i.key]).length} left)`}
        </button>
        {showCheck && (
          <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            {ITEMS.map((it) => {
              const on = !!checks[it.key];
              return (
                <button key={it.key} onClick={() => toggle(it.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid ' + (on ? 'var(--green)' : 'var(--border-strong)'), background: on ? 'color-mix(in oklab, var(--green) 10%, var(--surface-1))' : 'var(--surface-2)' }}>
                  {on ? <CircleCheck size={20} style={{ color: 'var(--green)', flexShrink: 0 }} /> : <Circle size={20} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />}
                  <span style={{ fontSize: 14, fontWeight: 700, color: on ? 'var(--fg-1)' : 'var(--fg-2)' }}>{it.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <button onClick={acknowledge} disabled={pending}
          style={{ width: '100%', marginTop: 4, padding: '17px', borderRadius: 13, fontSize: 17, fontWeight: 800, cursor: 'pointer', border: 'none', background: 'var(--amber)', color: '#1a1206', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Locking in…' : "✅ I know today's plan"}
        </button>
        <div className="muted" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>Tapping takes you to My Day. Hank's word stays private to you.</div>
      </div>

      {/* ── START OF DAY GATE (HTML sod pane) — pre-trip / tools / handbook + unlock My Day ── */}
      {sodGate && <SodGate sod={sodGate.sod} tools={sodGate.tools} handbook={sodGate.handbook} helper={sodGate.helper} />}
    </div>
  );
}

function SectionLabel({ children, inline }) {
  return <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--amber-dim)', marginBottom: inline ? 0 : 8 }}>{children}</div>;
}
