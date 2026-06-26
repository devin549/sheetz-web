// P4 — the alert brain's registry + writer. Every named workflow (audit #4) is declared here once, then
// the scanners (lib/alertScans.js) and the cron (/api/cron/triggers) reference it by key. The CONTRACT
// (Devin): an alert creates an in-app TASK first; email/text is a later, explicit escalation — never the
// default. AI may suggest/flag; a human claims + resolves the task. Everything is fail-soft + logged.

import { getSupabaseAdmin } from './supabaseAdmin';

// key → { label, severity, entity, role (who should action it), escalate? }. Keep keys stable: they are
// the dedupe namespace and show on the task. This is the canonical list from Devin's trigger spec.
export const WORKFLOWS = {
  geofence_leave:    { label: 'Left job geofence while On-Site', severity: 'high', entity: 'job',     role: 'dispatch' },
  no_status:         { label: 'No status update',               severity: 'med',  entity: 'job',     role: 'dispatch' },
  running_late:      { label: 'Running late — next customer at risk', severity: 'high', entity: 'job', role: 'dispatch' },
  two_techs_city:    { label: 'Two techs same city, bad routing', severity: 'low', entity: 'tech',   role: 'dispatch' },
  route_swap:        { label: 'Better route / swap available',    severity: 'low',  entity: 'job',     role: 'dispatch' },
  material_over:     { label: 'Material cost 20%+ over expected',  severity: 'med',  entity: 'job',     role: 'accounting' },
  parts_unbilled:    { label: 'Parts pulled, not billed/returned', severity: 'med', entity: 'job',     role: 'accounting' },
  missing_receipt:   { label: 'Missing receipt',                  severity: 'med',  entity: 'job',     role: 'accounting' },
  low_margin:        { label: 'Low-margin job / project',         severity: 'med',  entity: 'job',     role: 'accounting' },
  photo_qa:          { label: 'Missing / failed photo QA',        severity: 'med',  entity: 'job',     role: 'fs' },
  ar_followup:       { label: 'AR collection follow-up',          severity: 'med',  entity: 'invoice', role: 'accounting' },
  paylink_unpaid:    { label: 'Payment link opened but unpaid',   severity: 'med',  entity: 'invoice', role: 'accounting' },
  net30_over:        { label: 'Net-30 over limit',                severity: 'high', entity: 'customer', role: 'accounting' },
  missed_lead:       { label: 'Missed lead / call untouched',     severity: 'high', entity: 'lead',    role: 'csr' },
  oncall_unclaimed:  { label: 'On-call shift unclaimed',          severity: 'high', entity: 'oncall',  role: 'om' },
};

const SEV_TO_PRIORITY = { high: 'high', med: 'normal', low: 'low' };
const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);

// Create (or bump) an in-app alert task. Idempotent on dedupeKey: if a non-terminal task with that key
// exists, we bump seen_count + last_seen_at instead of inserting a duplicate. Returns {ok, created, id}.
export async function createAlert(sb, a = {}) {
  sb = sb || getSupabaseAdmin();
  if (!sb) return { ok: false, created: false, error: 'no admin client' };
  const wf = WORKFLOWS[a.kind] || {};
  const severity = a.severity || wf.severity || 'med';
  const dedupeKey = clean(a.dedupeKey || (a.kind && a.entityId ? `${a.kind}:${a.entityId}` : ''), 200);
  const nowISO = a.nowISO || new Date().toISOString();

  try {
    if (dedupeKey) {
      const { data: existing } = await sb.from('tasks').select('id, seen_count')
        .eq('dedupe_key', dedupeKey).in('status', ['open', 'snoozed']).maybeSingle();
      if (existing) {
        await sb.from('tasks').update({ seen_count: (existing.seen_count || 1) + 1, last_seen_at: nowISO }).eq('id', existing.id);
        return { ok: true, created: false, id: existing.id };
      }
    }
    const row = {
      title: clean(a.title || wf.label || 'Alert', 200),
      detail: clean(a.body || '', 2000),
      assignee: clean(a.assignee || wf.role || '', 120),
      priority: SEV_TO_PRIORITY[severity] || 'normal',
      status: 'open', source: 'system', kind: clean(a.kind, 60),
      dedupe_key: dedupeKey || null, entity: clean(wf.entity || a.entity, 40), entity_id: clean(a.entityId, 120),
      meta: a.meta || {}, last_seen_at: nowISO, created_by: 'system',
    };
    const { data, error } = await sb.from('tasks').insert(row).select('id').maybeSingle();
    if (error) {
      // Unique-index race (another run inserted the same key) → treat as bumped, not an error.
      if (/duplicate key|unique/i.test(error.message || '')) return { ok: true, created: false };
      if (/column .* does not exist|schema cache/i.test(error.message || '')) return { ok: false, created: false, error: 'run supabase/86_task_alerts.sql' };
      return { ok: false, created: false, error: error.message };
    }
    try {
      await sb.from('audit_log').insert({ actor_name: 'system', role: 'system', action: 'alert.created', entity: row.entity || 'task', entity_id: row.entity_id || String(data?.id || ''), detail: { kind: row.kind, severity, dedupe: dedupeKey } });
    } catch (_) {}
    return { ok: true, created: true, id: data?.id };
  } catch (e) {
    return { ok: false, created: false, error: String(e && e.message || e) };
  }
}
