'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canAny } from '@/lib/roles';
import { TOOL_EVENTS, STATUS_AFTER } from '@/lib/toolLedger';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const isMgr = (r) => canAny(r, ['manageInventory', 'assignJobs', 'manageUsers', 'seeCrew']);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}

// Log ANY tool lifecycle event (issued/loaned/returned/broke/repaired/lost/retired/reacked) → writes the
// permanent ledger row + updates the tool's quick status/holder. Managers do most; a tech can report their
// own tool broke/lost/returned. opts: { holderName, costDollars, note, conditionPhoto }.
export async function logToolEvent(toolId, event, opts = {}) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!TOOL_EVENTS[event]) return { ok: false, msg: 'Unknown event.' };
  const techCanSelfReport = ['broke', 'lost', 'returned', 'reacked'].includes(event);
  if (!isMgr(c.profile.role) && !techCanSelfReport) return { ok: false, msg: 'A manager issues / retires tools.' };

  const { data: tool } = await c.sb.from('tools').select('id, name, assigned_to').eq('id', toolId).maybeSingle();
  if (!tool) return { ok: false, msg: 'Tool not found.' };
  // Who's responsible: the named holder, else who it's currently with, else the reporter (a tech self-reporting).
  const holder = clean(opts.holderName, 120) || tool.assigned_to || (techCanSelfReport ? (c.profile.name || c.user.email) : null);

  const row = {
    tool_id: toolId, tool_name: tool.name || 'Tool', event,
    holder_name: holder, by_name: c.profile.name || c.user.email, by_id: c.user.id,
    condition_photo: clean(opts.conditionPhoto, 400) || null,
    cost_cents: Math.max(0, Math.round((Number(opts.costDollars) || 0) * 100)),
    note: clean(opts.note, 500) || null,
  };
  let { error } = await c.sb.from('tool_events').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/97_tool_events.sql first.' : error.message };

  // Quick status on the tool (history is the source of truth in tool_events).
  const patch = {};
  const status = STATUS_AFTER[event];
  if (status) patch.status = status;
  if (event === 'issued' || event === 'loaned') { patch.issued_to = holder; patch.assigned_to = holder; }
  if (event === 'returned' || event === 'repaired' || event === 'found') patch.issued_to = null;
  if (event === 'retired') patch.retired_at = new Date().toISOString();
  if (Object.keys(patch).length) { try { await c.sb.from('tools').update(patch).eq('id', toolId); } catch (_) {} }

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'tool.' + event, entity: 'tool', entity_id: String(toolId), detail: { holder, cost_cents: row.cost_cents } }); } catch (_) {}
  revalidatePath('/tools');
  return { ok: true, msg: `${TOOL_EVENTS[event].label}${holder ? ` · ${holder}` : ''}.` };
}
