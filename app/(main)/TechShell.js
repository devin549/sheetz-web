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
import BottomBar from './BottomBar';

// ⚡ The Power Plunger pull moved OUT of the ribbon to the 👑 Level tab (/level) — one home for level + pull.
// The ribbon's 👑 Plunger·Lvl chip links there.

const RAIL = [
  { group: 'Work', items: [
    { icon: '🌅', label: 'Start', href: '/start' },
    { icon: '📋', label: 'My Day', href: '/my-day' },
    { icon: '🧲', label: 'Bids', href: '/bids' },
    { icon: '📕', label: 'Pricebook', href: '/estimate' },
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
    { icon: '👑', label: 'Level', href: '/level', money: true },
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

// Honest empty default — the real figures come from the server (layout.js). A null stat hides its chip
// rather than showing a placeholder number, so a brand-new tech never sees invented rank/streak/level.
const GAME = { rank: null, rankDelta: 0, streak: null, powerHour: null, level: null, levelPct: null };

export default function TechShell({ name, photoUrl = null, shells = ['tech'], activeJob = null, game = GAME, wmId = '', chatUnread = 0, onCallPending = 0, children }) {
  const path = usePathname();
  const [cust, setCust] = useState(false);
  const [peek, setPeek] = useState(false);
  const [atHouse, setAtHouse] = useState(false);
  // Auto-quiet: when the customer can glance at the iPad, hide the money/rank ribbon automatically.
  // Triggers two ways — job status = ON-SITE, OR the device GPS is within ~150m of the job address
  // (geofence; no key needed — the job's lat/lng is geocoded at booking). Tech can briefly "peek".
  // Hand-to-Customer is the stronger manual lock.
  const onSite = !!(activeJob && activeJob.onSite);
  // In the job cockpit the tech is working the ticket in front of the customer — auto-quiet the money/rank
  // ribbon there too, not just on an ON-SITE status or GPS hit (En route + standing in the house still needs
  // to be quiet; status/GPS can lag or be denied). Being on a /job/ screen is the reliable signal.
  const inJob = /^\/job\/[^/]+/.test(path);
  const quiet = (onSite || atHouse || inJob) && !peek && !cust;
  // Hide the global office "Sheetz" topbar — the cockpit owns its own chrome (no office clutter).
  useEffect(() => {
    // Add the cockpit chrome class but DON'T pin the theme — the field app defaults to LIGHT (matches the
    // HTML), and the tech can flip to dark with the toggle (persisted via the theme cookie in layout.js).
    const el = document.documentElement;
    el.classList.add('cb-tech');
    return () => { el.classList.remove('cb-tech'); };
  }, []);
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
  const curId = jobMatch ? jobMatch[1] : (activeJob ? activeJob.id : null);
  // Global rail's Job/Photos/Tools → the active job's screens, or "pick a job first".
  const pick = (sub) => (activeJob ? `/job/${activeJob.id}${sub}` : '/pick-a-job');
  const rail = inJob
    ? [{ group: 'This job', items: [
        { icon: '‹', label: 'My Day', href: '/my-day' },
        { icon: '📋', label: 'Overview', href: `/job/${curId}` },
        { icon: '📝', label: 'Forms', href: `/job/${curId}/forms` },
        { icon: '📸', label: 'Photos', href: `/job/${curId}/photos` },
        // Sell flow: build in the Pricebook → the Quote tab carries it estimate → accept = invoice → collect.
        { icon: '📖', label: 'Pricebook', href: `/job/${curId}/pricebook` },
        { icon: '💵', label: 'Quote', href: `/job/${curId}/estimate` },
        { icon: '📦', label: 'Parts/PO', href: `/job/${curId}/parts` },
        { icon: '🔧', label: 'Equipment', href: `/job/${curId}/equipment` },
        { icon: '🕑', label: 'History', href: `/job/${curId}/history` },
      ] }]
    : [...RAIL, ...(canOffice ? [{ group: 'Owner', items: [{ icon: '🔐', label: 'Command Center', href: '/?cc=1' }, { icon: '⚖️', label: 'Legal terms', href: '/legal-terms' }] }] : [])];
  // global rail — Job/Proof removed (reach jobs via My Day; proof photos live inside the job).
  // Command Center is an owner-only PIN-gated side tab (no longer the default landing).

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
      {/* Leak-trace watermark — INTERNAL only. Never shown once the iPad is handed to a customer. */}
      {!cust && <Watermark label={wmLabel} />}
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
          {!cust && <ThemeToggle />}
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
          <span style={{ color: '#fff', fontWeight: 800 }}>{activeJob?.customer || 'On a job'}</span>
          {activeJob?.number ? <span style={{ color: '#a5d6a7', fontWeight: 600 }}>· {activeJob.number}</span> : null}
          {activeJob?.address ? <span style={{ color: '#7fbf9a', fontWeight: 500, fontSize: 11 }}>· 📍 {activeJob.address}</span> : null}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.85, fontSize: 11 }}>🤫 Quiet — pay/rank hidden from the customer</span>
            <button onClick={() => setPeek(true)} style={{ background: 'transparent', border: '1px solid #4caf50', color: '#a5d6a7', borderRadius: 12, padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>👁 Peek stats</button>
          </span>
        </div>
      )}

      {/* ── ENGAGEMENT RIBBON (tech-only) ────────────────────────── */}
      {!cust && !quiet && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, rowGap: 6, flexWrap: 'wrap', padding: '8px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--fg-2)',
          background: 'linear-gradient(90deg, #3a1d00 0%, #0e3a5c 28%, #0c402e 52%, #3a124a 76%, #3a1d00 100%)', borderTop: '2px solid #ffc400', borderBottom: '2px solid #ff8f00' }}>
          {peek && (onSite || atHouse || inJob) && (
            <button onClick={() => setPeek(false)} title="Hide again (customer could be looking)" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(76,175,80,0.18)', border: '1px solid #4caf50', color: '#a5d6a7', borderRadius: 12, padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>🤫 Hide</button>
          )}
          <Link href="/my-day?tab=money" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(105,240,174,0.12)', border: '1px solid #2ee6a0', borderRadius: 14, padding: '4px 11px' }}>
            💰 <span style={{ color: '#69f0ae', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 800 }}>My Day $</span><span style={{ color: '#a5d6a7', fontWeight: 800 }}>›</span>
          </Link>
          {/* Each stat chip carries its own leading divider and renders ONLY when it has real data — so a
              brand-new tech (no rank/streak/level yet) sees a clean ribbon, never invented numbers. */}
          {game.rank != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(255,196,60,0.5)' }}>│</span>
              🏆 <span style={{ color: '#c3cbd5', fontSize: 10, textTransform: 'uppercase' }}>Rank</span>
              <span style={{ color: '#ffc44d', fontWeight: 800, fontSize: 16 }}>#{game.rank}</span>
              {game.rankDelta ? <span style={{ color: '#8ef0a0', fontWeight: 800, fontSize: 11, background: 'rgba(76,175,80,0.25)', border: '1px solid #6ddc84', borderRadius: 10, padding: '2px 6px' }}>▲{game.rankDelta}</span> : null}
            </span>
          )}
          {game.streak != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(255,196,60,0.5)' }}>│</span>
              🔥 <span style={{ color: '#ff9e6b', fontWeight: 800, fontSize: 14 }}>{game.streak}</span><span style={{ color: '#c3cbd5', fontSize: 10, textTransform: 'uppercase' }}>day on-time</span>
            </span>
          )}
          {game.powerHour != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,179,0,0.18)', padding: '4px 10px', borderRadius: 14, border: '1px solid #ffc44d' }}>
              ⚡ <span style={{ color: '#ffc44d', fontWeight: 800, fontSize: 11, textTransform: 'uppercase' }}>Power Plunger Hour</span><span style={{ color: '#ffeb3b', fontWeight: 800 }}>{game.powerHour}m</span>
            </span>
          )}
          {/* 👑 Level — taps through to the Level tab (XP progress + the 🎰 Power Plunger pull now live there). */}
          <Link href="/level" title="Your level + the Power Plunger pull" style={{ marginLeft: 'auto', paddingRight: 6, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>👑
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ color: '#ffc44d', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Plunger · {game.level != null ? `Lvl ${game.level}` : 'Level'} ›</span>
              {game.level != null && <span style={{ background: 'rgba(255,255,255,0.22)', width: 80, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 2 }}><span style={{ display: 'block', width: `${game.levelPct ?? 0}%`, height: '100%', background: '#ffc44d' }} /></span>}
              <span style={{ color: '#c3cbd5', fontSize: 8 }}>{game.level != null ? `${game.levelPct ?? 0}% to next · 🎰 pull` : 'tap for your level + 🎰 pull'}</span>
            </span>
          </Link>
        </div>
      )}
      {cust && (
        <div style={{ padding: '9px 16px', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, #4caf50 0%, #1b5e20 100%)' }}>
          🔒 Customer view — pay, races &amp; rank are hidden. Tap “Exit customer view” to return.
        </div>
      )}

      {/* ── BODY: left rail + content ────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav className="cb-siderail" style={{ width: 84, flexShrink: 0, background: 'var(--surface-1)', borderRight: '1px solid var(--border)', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {rail.map((grp) => {
            if (cust && grp.money) return null; // hide the whole "Me" money group in customer view
            return (
              <div key={grp.group}>
                <div style={{ fontSize: 8, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 4px 4px', textAlign: 'center', fontWeight: 700 }}>{grp.group}</div>
                {grp.items.map((it) => {
                  if (cust && it.money) return null;
                  const A = active(it.href);
                  // Chat = LIVE unread badge (blinks). Cal = LIVE on-call-to-acknowledge badge in PURPLE (matches
                  // the on-call banners), blinks until they go ack it. Others use their static sample badge.
                  const isChat = it.href === '/messages';
                  const isCal = it.href === '/pto';
                  const badge = isChat ? (chatUnread > 0 ? (chatUnread > 9 ? '9+' : String(chatUnread)) : null)
                    : isCal ? (onCallPending > 0 ? String(onCallPending) : null)
                    : it.badge;
                  const blink = (isChat && chatUnread > 0) || (isCal && onCallPending > 0);
                  const badgeColor = isCal && onCallPending > 0 ? '#9c64f4' : 'var(--red, #d32f2f)';
                  return (
                    <Link key={it.label} href={it.href} title={it.label}
                      style={{ position: 'relative', width: 76, height: 60, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, textDecoration: 'none',
                        color: A ? 'var(--amber)' : 'var(--fg-3)', background: A ? 'var(--surface-2)' : 'transparent', fontSize: 10, fontWeight: A ? 800 : 600 }}>
                      <span style={{ fontSize: 20 }}>{it.icon}</span>
                      <span>{it.label}</span>
                      {badge && <span className={blink ? 'pill-blink' : undefined} style={{ position: 'absolute', top: 4, right: 8, background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 9, fontWeight: 800 }}>{badge}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <main className="cb-techmain" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>{children}</main>
      </div>

      {/* 📱 iPad bottom tab bar — thumb nav (hidden in customer view + on wide desktop, where the side rail shows). */}
      {!cust && <BottomBar rail={rail} />}
    </div>
  );
}
