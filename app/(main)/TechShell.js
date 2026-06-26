'use client';

// THE FIELD COCKPIT — iPad-only chrome, ported from the live SPA (CB_Dispatch_TechIpadHtml_v1.js).
// Not the desktop app squeezed down: big touch targets, job-first, zero office/accounting/admin.
// Three pieces: a top header (logo · who · active-job pin · Hand-to-Customer · clock), a gamified
// engagement ribbon (tech-only — hidden when the iPad is handed to a customer or on-site), and a
// grouped LEFT icon rail (Work / Comms / Me / Truck). Money surfaces are tagged so Customer Mode
// hides them in one switch. Gamification figures are sample for now (seam = the `game` prop).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Watermark from './Watermark';
import ThemeToggle from '@/components/ThemeToggle';

const RAIL = [
  { group: 'Work', items: [
    { icon: '🌅', label: 'Start', href: '/start' },
    { icon: '📋', label: 'My Day', href: '/my-day' },
    { icon: '🧲', label: 'Bids', href: '/bids' },
    { icon: '🌙', label: 'End', href: '/end' },
  ] },
  { group: 'Comms', items: [
    { icon: '💬', label: 'Chat', href: '/messages' },
    { icon: '🪠', label: 'Hank', href: '/hank' },
  ] },
  { group: 'Me', money: true, items: [
    { icon: '💵', label: 'Pay', href: '/pay', money: true },
    { icon: '🏁', label: 'Races', href: '/races', money: true, badge: '5' },
    { icon: '🏆', label: 'Record', href: '/record', money: true },
    { icon: '📆', label: 'Cal', href: '/pto' },
    { icon: '⭐', label: 'Reviews', href: '/reviews' },
  ] },
  { group: 'Truck', items: [
    { icon: '🚐', label: 'My Truck', href: '/my-truck' },
    { icon: '🔍', label: 'ID Part', href: '/identify' },
    // Shop folded into My Truck (Shop Inventory + truck-wide search) — matches the HTML unified inventory.
    { icon: '📣', label: 'Mkt', href: '/mkt' },
    { icon: '⚙️', label: 'Set', href: '/account' },
  ] },
];

function switchShell(s) {
  document.cookie = `cb_shell=${s}; path=/; max-age=${60 * 60 * 24 * 365}`;
  window.location.href = s === 'office' ? '/' : s === 'shop' ? '/shop' : '/my-day';
}

const GAME = { rank: 2, rankDelta: 1, streak: 6, powerHour: 47, level: 7, levelPct: 84 };

export default function TechShell({ name, photoUrl = null, shells = ['tech'], activeJob = null, game = GAME, wmId = '', children }) {
  const path = usePathname();
  const [cust, setCust] = useState(false);
  const [peek, setPeek] = useState(false);
  const [atHouse, setAtHouse] = useState(false);
  // Auto-quiet: when the customer can glance at the iPad, hide the money/rank ribbon automatically.
  // Triggers two ways — job status = ON-SITE, OR the device GPS is within ~150m of the job address
  // (geofence; no key needed — the job's lat/lng is geocoded at booking). Tech can briefly "peek".
  // Hand-to-Customer is the stronger manual lock.
  const onSite = !!(activeJob && activeJob.onSite);
  const quiet = (onSite || atHouse) && !peek && !cust;
  // Hide the global office "Sheetz" topbar — the cockpit owns its own chrome (no office clutter).
  useEffect(() => { document.documentElement.classList.add('cb-tech'); return () => document.documentElement.classList.remove('cb-tech'); }, []);
  // Geofence: while on an active job with coords, watch device location and auto-quiet within ~150m.
  useEffect(() => {
    const lat = activeJob && activeJob.lat, lng = activeJob && activeJob.lng;
    if (lat == null || lng == null || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const toRad = (d) => (d * Math.PI) / 180;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const dLat = toRad(pos.coords.latitude - lat), dLng = toRad(pos.coords.longitude - lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(pos.coords.latitude)) * Math.sin(dLng / 2) ** 2;
        const meters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setAtHouse(meters <= 150);
      },
      () => setAtHouse(false), // permission denied / unavailable → fall back to status-based quiet
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
    );
    return () => { try { navigator.geolocation.clearWatch(id); } catch (_) {} };
  }, [activeJob && activeJob.id, activeJob && activeJob.lat, activeJob && activeJob.lng]);
  const active = (h) => h !== '/soon' && (path === h || path.startsWith(h + '/'));
  const canOffice = shells.includes('office');
  const initials = String(name || 'Tech').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const today = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  // Leak-trace watermark label — who + a short trace id + date, tiled over internal screens.
  const wmLabel = `${name || 'Tech'} · ${wmId} · ${today} · CB CONFIDENTIAL`;
  // In-job context: when viewing a job, the rail becomes job-contextual (Job·Photos·Tools·Pay·Notes·History).
  const jobMatch = path.match(/^\/job\/([^/]+)/);
  const inJob = !!jobMatch;
  const curId = jobMatch ? jobMatch[1] : (activeJob ? activeJob.id : null);
  // Global rail's Job/Photos/Tools → the active job's screens, or "pick a job first".
  const pick = (sub) => (activeJob ? `/job/${activeJob.id}${sub}` : '/pick-a-job');
  const rail = inJob
    ? [{ group: 'This job', items: [
        { icon: '‹', label: 'My Day', href: '/my-day' },
        { icon: '📋', label: 'Overview', href: `/job/${curId}` },
        { icon: '📝', label: 'Forms', href: `/job/${curId}/forms` },
        { icon: '🧾', label: 'Proof', href: `/job/${curId}/photos` },
        { icon: '🧾', label: 'Estimate', href: `/job/${curId}/estimate` },
        { icon: '💳', label: 'Invoice', href: `/job/${curId}/invoice` },
        { icon: '📦', label: 'Parts/PO', href: `/job/${curId}/parts` },
        { icon: '📖', label: 'Pricebook', href: `/job/${curId}/pricebook` },
        { icon: '🔧', label: 'Equipment', href: `/job/${curId}/equipment` },
        { icon: '🕑', label: 'History', href: `/job/${curId}/history` },
      ] }]
    : [{ group: 'Job', items: [
        { icon: '🧰', label: 'Job', href: activeJob ? `/job/${activeJob.id}` : '/my-day' },
        { icon: '🧾', label: 'Proof', href: pick('/photos') },
        // Tools folded into My Truck (matches the HTML — no standalone Tools on the rail).
      ] }, ...RAIL];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      <Watermark label={wmLabel} />
      {/* ── HEADER ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: 'var(--amber)', fontSize: 15, whiteSpace: 'nowrap' }}>⚡ CB Dispatch</div>
        <div className="muted" style={{ fontSize: 12 }}>{name} · {today}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--green)', display: 'inline-block' }} /> On shift
        </div>

        {activeJob && (
          <Link href={`/job/${activeJob.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #1a3a2a 0%, #0f2a1a 100%)', border: '1px solid #4caf50', color: '#a5d6a7', padding: '6px 12px', borderRadius: 18, fontSize: 11, fontWeight: 700 }}>
            📌 <span style={{ color: '#fff' }}>{activeJob.customer || 'Active job'}</span>
            {activeJob.number ? <span style={{ color: '#a5d6a7', fontWeight: 400 }}>· {activeJob.number}</span> : null}
            <span style={{ background: 'rgba(76,175,80,0.3)', color: '#a5d6a7', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 800 }}>{activeJob.statusLabel || 'ON-SITE'}</span>
          </Link>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          {canOffice && (
            <button onClick={() => switchShell('office')} title="Switch to the office app" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '5px 11px', cursor: 'pointer' }}>
              💼 Office
            </button>
          )}
          <button onClick={() => setCust((v) => !v)} title="Hand the iPad to the customer — hides pay/races/rank" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#fff', background: cust ? 'var(--surface-2)' : 'linear-gradient(135deg, #4caf50 0%, #1b5e20 100%)', border: cust ? '1px solid var(--green)' : 'none', borderRadius: 14, padding: '6px 12px', cursor: 'pointer' }}>
            🔒 {cust ? 'Exit customer view' : 'Hand to Customer'}
          </button>
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="av" style={{ width: 30, height: 30, borderRadius: 999, objectFit: 'cover', border: '1px solid var(--amber)' }} />
          ) : (
            <div className="av" style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--amber)', color: '#1a1206', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{initials}</div>
          )}
          <form action="/auth/signout" method="post" style={{ display: 'inline' }}>
            <button type="submit" title="Sign out" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '5px 10px', cursor: 'pointer' }}>🚪 Out</button>
          </form>
        </div>
      </div>

      {/* ── ON-SITE QUIET BAND — customer could be looking; money/rank auto-hidden ── */}
      {!cust && quiet && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', fontSize: 12, color: '#a5d6a7', fontWeight: 700, background: 'linear-gradient(90deg, #1a3a2a 0%, #0f2a1a 100%)', borderTop: '1px solid #4caf50', borderBottom: '1px solid #4caf50', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>🏠</span>
          <span style={{ color: '#fff', fontWeight: 800 }}>{activeJob.customer}</span>
          {activeJob.number ? <span style={{ color: '#a5d6a7', fontWeight: 600 }}>· {activeJob.number}</span> : null}
          {activeJob.address ? <span style={{ color: '#7fbf9a', fontWeight: 500, fontSize: 11 }}>· 📍 {activeJob.address}</span> : null}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.85, fontSize: 11 }}>🤫 Quiet — pay/rank hidden from the customer</span>
            <button onClick={() => setPeek(true)} style={{ background: 'transparent', border: '1px solid #4caf50', color: '#a5d6a7', borderRadius: 12, padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>👁 Peek stats</button>
          </span>
        </div>
      )}

      {/* ── ENGAGEMENT RIBBON (tech-only) ────────────────────────── */}
      {!cust && !quiet && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--fg-2)', overflowX: 'auto',
          background: 'linear-gradient(90deg, #3a1d00 0%, #0e3a5c 28%, #0c402e 52%, #3a124a 76%, #3a1d00 100%)', borderTop: '2px solid #ffc400', borderBottom: '2px solid #ff8f00' }}>
          {onSite && peek && (
            <button onClick={() => setPeek(false)} title="Hide again (you're on-site)" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(76,175,80,0.18)', border: '1px solid #4caf50', color: '#a5d6a7', borderRadius: 12, padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>🤫 Hide</button>
          )}
          <Link href="/pay" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(105,240,174,0.12)', border: '1px solid #2ee6a0', borderRadius: 14, padding: '4px 11px' }}>
            💰 <span style={{ color: '#69f0ae', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 800 }}>My Day $</span><span style={{ color: '#a5d6a7', fontWeight: 800 }}>›</span>
          </Link>
          <span style={{ color: 'rgba(255,196,60,0.5)' }}>│</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🏆 <span style={{ color: 'var(--fg-3)', fontSize: 10, textTransform: 'uppercase' }}>Rank</span>
            <span style={{ color: 'var(--amber)', fontWeight: 800, fontSize: 16 }}>#{game.rank}</span>
            {game.rankDelta ? <span style={{ color: '#4caf50', fontWeight: 800, fontSize: 11, background: 'rgba(76,175,80,0.15)', border: '1px solid #4caf50', borderRadius: 10, padding: '2px 6px' }}>▲{game.rankDelta}</span> : null}
          </span>
          <span style={{ color: 'rgba(255,196,60,0.5)' }}>│</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🔥 <span style={{ color: '#ff8a65', fontWeight: 800, fontSize: 14 }}>{game.streak}</span><span style={{ color: 'var(--fg-3)', fontSize: 10, textTransform: 'uppercase' }}>day on-time</span></span>
          <span style={{ color: 'rgba(255,196,60,0.5)' }}>│</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,179,0,0.12)', padding: '4px 10px', borderRadius: 14, border: '1px solid var(--amber)' }}>
            ⚡ <span style={{ color: 'var(--amber)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase' }}>Power Plunger Hour</span><span style={{ color: '#ffeb3b', fontWeight: 800 }}>{game.powerHour}m</span>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>👑
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ color: 'var(--amber)', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Plunger · Lvl {game.level}</span>
              <span style={{ background: 'var(--surface-2)', width: 80, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 2 }}><span style={{ display: 'block', width: `${game.levelPct}%`, height: '100%', background: 'var(--amber)' }} /></span>
              <span style={{ color: 'var(--fg-3)', fontSize: 8 }}>{game.levelPct}% to next</span>
            </span>
          </span>
        </div>
      )}
      {cust && (
        <div style={{ padding: '9px 16px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, #4caf50 0%, #1b5e20 100%)' }}>
          🔒 Customer view — pay, races &amp; rank are hidden. Tap “Exit customer view” to return.
        </div>
      )}

      {/* ── BODY: left rail + content ────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav style={{ width: 84, flexShrink: 0, background: 'var(--surface-1)', borderRight: '1px solid var(--border)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {rail.map((grp) => {
            if (cust && grp.money) return null; // hide the whole "Me" money group in customer view
            return (
              <div key={grp.group}>
                <div style={{ fontSize: 8, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 4px 4px', textAlign: 'center', fontWeight: 700 }}>{grp.group}</div>
                {grp.items.map((it) => {
                  if (cust && it.money) return null;
                  const A = active(it.href);
                  return (
                    <Link key={it.label} href={it.href} title={it.label}
                      style={{ position: 'relative', width: 76, height: 60, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, textDecoration: 'none',
                        color: A ? 'var(--amber)' : 'var(--fg-3)', background: A ? 'var(--surface-2)' : 'transparent', fontSize: 10, fontWeight: A ? 800 : 600 }}>
                      <span style={{ fontSize: 20 }}>{it.icon}</span>
                      <span>{it.label}</span>
                      {it.badge && <span style={{ position: 'absolute', top: 4, right: 8, background: 'var(--red, #d32f2f)', color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 9, fontWeight: 800 }}>{it.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>{children}</main>
      </div>
    </div>
  );
}
