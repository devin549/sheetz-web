import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { FIELD_POSITIONS } from '@/lib/positions';
import { requiredNames } from '@/lib/meetings';
import MeetingsClient from './MeetingsClient';

export const dynamic = 'force-dynamic';
const SENDERS = ['owner', 'admin', 'gm', 'om', 'fs', 'foreman'];

export default async function Meetings() {
  const { user, role, profile } = await requireHref('/meetings');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">📅 Meetings</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const myName = profile.name || (user && user.email) || '';
  const canCreate = SENDERS.includes(String(role || '').toLowerCase());

  // Roster for audience resolution + crew dropdown.
  let roster = [];
  let tQ = await sb.from('techs').select('name, crew, position, active, supervisor').limit(500);
  if (tQ.error) tQ = await sb.from('techs').select('name, crew, position, active').limit(500);
  if (tQ.error) tQ = await sb.from('techs').select('name, crew').limit(500);
  if (!tQ.error) roster = (tQ.data || []).filter((t) => t.name);
  const fieldRoster = roster.filter((t) => t.active !== false && (!t.position || FIELD_POSITIONS.includes(String(t.position).toLowerCase().replace(/\s+/g, '_'))));
  const crewNames = [...new Set(roster.map((t) => t.crew).filter(Boolean))].sort();
  // How many people report to the viewer (so we know whether to offer "My crew").
  const myManagedCount = fieldRoster.filter((t) => String(t.supervisor || '').toLowerCase() === myName.toLowerCase()).length;

  const requiredFor = (audience) => requiredNames(fieldRoster, audience);

  // Upcoming + recent meetings.
  let meetings = [];
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  let mQ = await sb.from('meetings').select('*').gte('starts_at', since).order('starts_at', { ascending: true }).limit(50);
  const missing = mQ.error && /meetings|does not exist|schema cache/i.test(mQ.error.message || '');
  if (!mQ.error) {
    const ids = (mQ.data || []).map((m) => m.id);
    let acks = [];
    if (ids.length) { const aQ = await sb.from('meeting_acks').select('meeting_id, tech_name').in('meeting_id', ids); acks = aQ.data || []; }
    meetings = (mQ.data || []).map((m) => {
      const required = requiredFor(m.audience);
      const acked = acks.filter((a) => a.meeting_id === m.id).map((a) => a.tech_name);
      const ackedLc = new Set(acked.map((n) => n.toLowerCase()));
      const pending = required.filter((n) => !ackedLc.has(n.toLowerCase()));
      const iAmRequired = required.some((n) => n.toLowerCase() === myName.toLowerCase()) || m.audience === 'everyone';
      const iAcked = ackedLc.has(myName.toLowerCase());
      return { ...m, requiredCount: required.length, acked, pending, iAmRequired, iAcked };
    });
  }

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">📅 Meetings</div>
      <p className="muted">Send a meeting to your crew (or everyone). Each person taps 👍 to acknowledge — and it adds to their calendar.</p>
      {missing && <div className="notice">Meetings need their tables — run <code>supabase/63_meetings.sql</code> in Supabase.</div>}
      <MeetingsClient meetings={meetings} crewNames={crewNames} canCreate={canCreate} myName={myName} myManagedCount={myManagedCount} />
    </div>
  );
}
