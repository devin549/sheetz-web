import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { scopeToTech } from '@/lib/techJobScope';
import StartOfDay from './StartOfDay';

export const dynamic = 'force-dynamic';

function nyDayKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
function nyWindow(dateStr) {
  const off = (() => {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(new Date(dateStr + 'T12:00:00Z')).find((p) => p.type === 'timeZoneName');
    const m = (part?.value || 'GMT-5').match(/GMT([+-]\d{1,2})(?::(\d{2}))?/); const h = m ? parseInt(m[1], 10) : -5; return h * 60 + (h < 0 ? -1 : 1) * parseInt((m && m[2]) || '0', 10);
  })();
  const startMs = Date.parse(dateStr + 'T00:00:00Z') - off * 60000;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(startMs + 86400000).toISOString() };
}
function fmtTime(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; } }

export default async function Start() {
  const { user, profile } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew');
  const name = profile.name || user.email;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🌅 Start of Day</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();
  const day = nyDayKey();
  const { startISO, endISO } = nyWindow(day);

  // Today's jobs for this tech (tech_id link, or name/email fallback for unlinked techs).
  const jr = await scopeToTech(
    sb.from('jobs').select('id, job_number, job_type, scheduled_at, customers(name)')
      .gte('scheduled_at', startISO).lt('scheduled_at', endISO).order('scheduled_at', { ascending: true }),
    { profile, user }
  );
  const jobs = (jr.data || []).map((j) => ({ id: j.id, time: fmtTime(j.scheduled_at), customer: (j.customers && j.customers.name) || 'Customer', type: j.job_type || '' }));

  // On-call status (current week row; match the tech's name in any slot).
  let onCall = '';
  try {
    const { data: oc } = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
    if (oc && name) {
      const n = String(name).toLowerCase().split(/\s+/)[0];
      const hit = ['mon', 'tue', 'wed', 'thu', 'weekend', 'helper_week', 'supervisor'].find((k) => String(oc[k] || '').toLowerCase().includes(n));
      if (hit) onCall = hit === 'weekend' ? 'on-call this weekend' : hit === 'helper_week' ? 'helper on-call this week' : 'on-call this week';
    }
  } catch (_) {}

  // Saved SOD for today.
  let saved = null;
  try { const { data } = await sb.from('tech_shift_log').select('checklist, ready, notes').eq('user_id', user.id).eq('day_key', day).eq('kind', 'sod').maybeSingle(); saved = data || null; } catch (_) {}

  return <StartOfDay name={name} jobs={jobs} onCall={onCall} saved={saved} />;
}
