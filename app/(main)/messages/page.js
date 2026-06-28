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
    // Tag each message by importance off the TEAM ROSTER (techs.position + discord_name) — so it SCALES as
    // you hire: add a person on /team, pick their position, type their Discord handle, and the lanes follow
    // automatically (no SQL, no code change). 📌 personal (your name/handle is in it) > 🏢 office (from
    // office/management) > 💬 general crew. These are the non-field + management positions from lib/positions.
    const lc = (s) => String(s || '').trim().toLowerCase();
    const OFFICE_POSITIONS = new Set(['dispatcher', 'office_manager', 'accounting', 'shop', 'office', 'general_manager', 'owner', 'field_supervisor']);
    let roster = [];
    try { const rq = await sb.from('techs').select('name, position, discord_name'); roster = (rq.data || []).filter((t) => t.name); } catch (_) {}
    // Match an incoming #sheetz sender (stamped with a Discord handle) to a roster person: their mapped
    // discord_name first (exact), then full name, then first-name fallback.
    const matchPerson = (sender) => {
      const s = lc(sender); if (!s) return null;
      return roster.find((t) => t.discord_name && lc(t.discord_name) === s)
        || roster.find((t) => lc(t.name) === s)
        || roster.find((t) => lc(t.name).split(/\s+/)[0] === s.split(/\s+/)[0])
        || null;
    };
    // What "your name" looks like in a message: your first name + your mapped Discord handle.
    const meRow = matchPerson(profile.name);
    const myTokens = [String(profile.name || '').trim().split(/\s+/)[0], meRow && meRow.discord_name]
      .filter((x) => x && String(x).length >= 2).map((x) => lc(x));
    feed = feed.map((m) => {
      const isHank = /hank/i.test(m.from_name || '');
      const body = String(m.body || '');
      const personal = !isHank && myTokens.some((tok) => new RegExp(`(^|[^a-z0-9])${tok.replace(/[^a-z0-9]/g, '')}([^a-z0-9]|$)`, 'i').test(body));
      const sender = matchPerson(m.from_name);
      const office = !isHank && sender && OFFICE_POSITIONS.has(lc(sender.position));
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
