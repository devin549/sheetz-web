import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { discordConfigured, discordReadConfigured } from '@/lib/discord';
import CommsDeskClient from './CommsDeskClient';
import TechChat from './TechChat';

export const dynamic = 'force-dynamic';
const DELETE = ['owner', 'admin', 'gm', 'om'];
const FIELD = ['tech', 'helper', 'foreman', 'fs'];
const OFFICE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales', 'accounting', 'shop'];

export default async function CommsDesk() {
  // Field roles reach Chat too — but they get the simple Team Chat (the HTML pane), not the office desk.
  const { user, role, profile } = await requireRole([...OFFICE, ...FIELD]);
  const isField = FIELD.includes(String(role || '').toLowerCase()) && !OFFICE.includes(String(role || '').toLowerCase());

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">{isField ? 'Team Chat' : 'Comms Desk'}</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // ── TECH-SIDE: simple Team Chat (the #sheetz feed + a post box) ──
  if (isField) {
    let feed = [];
    try {
      let r = await sb.from('cb_comms').select('id, from_name, body, created_at, channel, direction, reply_to, provider_id').is('deleted_at', null).order('created_at', { ascending: false }).limit(80);
      if (r.error) r = await sb.from('cb_comms').select('id, from_name, body, created_at, channel').order('created_at', { ascending: false }).limit(80);
      // team feed only — the #sheetz/internal posts, not customer SMS/email threads
      feed = (r.data || []).filter((m) => /discord|internal|team|sheetz/i.test(String(m.channel || '')) || !m.channel).reverse();
    } catch (_) {}
    // Tag each message so the chat blinks by importance: 📌 personal (your name's in it = address this) >
    // 🏢 office (a heads-up from the office) > general crew chatter.
    const myFirst = String(profile.name || '').trim().split(/\s+/)[0].toLowerCase();
    let officeFirsts = new Set();
    try { const { data } = await sb.from('profiles').select('name, role').in('role', ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'marketing', 'sales']); (data || []).forEach((p) => { if (p.name) officeFirsts.add(String(p.name).trim().split(/\s+/)[0].toLowerCase()); }); } catch (_) {}
    feed = feed.map((m) => {
      const fromFirst = String(m.from_name || '').trim().split(/\s+/)[0].toLowerCase();
      const isHank = /hank/i.test(m.from_name || '');
      const personal = !isHank && myFirst.length >= 2 && new RegExp(`\\b${myFirst.replace(/[^a-z0-9]/g, '')}\\b`, 'i').test(String(m.body || ''));
      const office = !isHank && fromFirst && officeFirsts.has(fromFirst);
      return { ...m, tag: personal ? 'personal' : office ? 'office' : 'general' };
    });
    // Per-tech "Resolve" lives in their profile prefs (no migration) — clears a line from THIS person's
    // chat only, never the shared feed. Pull the set so the client can tuck them into a Resolved tab.
    let resolvedIds = [];
    try { const { data: pr } = await sb.from('profiles').select('prefs').eq('user_id', user.id).maybeSingle(); resolvedIds = (pr && pr.prefs && Array.isArray(pr.prefs.chat_resolved)) ? pr.prefs.chat_resolved : []; } catch (_) {}
    return <TechChat messages={feed} me={profile.name || user.email} resolvedIds={resolvedIds} />;
  }

  const canDelete = DELETE.includes(String(role || '').toLowerCase());
  let comms = [];
  // New columns (attachments/resolved) come with migration 61 — fall back gracefully.
  let res = await sb.from('cb_comms').select('id, channel, direction, to_addr, from_name, body, status, sent_by, created_at, resolved_at, attachments').is('deleted_at', null).order('created_at', { ascending: false }).limit(150);
  if (res.error) res = await sb.from('cb_comms').select('id, channel, direction, to_addr, from_name, body, status, sent_by, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(150);
  if (res.error) res = await sb.from('cb_comms').select('id, channel, to_addr, body, status, sent_by, created_at').order('created_at', { ascending: false }).limit(150);
  if (!res.error) comms = res.data || [];

  // Team identities for avatars + Discord-name matching.
  let people = [];
  let pQ = await sb.from('techs').select('name, photo_url, discord_name, discord_user_id, position').limit(400);
  if (pQ.error) pQ = await sb.from('techs').select('name, position').limit(400);
  if (!pQ.error) people = (pQ.data || []).filter((p) => p.name);

  // Proposed actions (reschedules Hank caught) awaiting a human confirm.
  let actions = [];
  try { const aQ = await sb.from('comms_actions').select('id, kind, summary, customer_name, tech_name, reason, old_date, new_date').eq('status', 'proposed').order('created_at', { ascending: false }).limit(20); if (!aQ.error) actions = aQ.data || []; } catch (_) {}

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Comms Desk</div>
      <p className="muted">What happened, who owns it, what needs done — built on the #sheetz feed (Captain Hook).</p>
      <CommsDeskClient comms={comms} people={people} actions={actions} discordReady={discordConfigured()} readReady={discordReadConfigured()} canDelete={canDelete} commsMissing={!!res.error} />
    </div>
  );
}
