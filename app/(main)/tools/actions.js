'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  return { user, profile, sb: getSupabaseAdmin() };
}
const isMgr = (r) => can(r, 'manageInventory') || can(r, 'assignJobs') || can(r, 'manageUsers');
const clean = (v, n = 80) => String(v || '').trim().slice(0, n);

// Teach the registry a field name → tool. Any field user can add an alias they actually use.
export async function addAlias(toolId, alias) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const a = clean(alias, 60);
  if (!a) return { ok: false, msg: 'Type the name to remember.' };
  try {
    const { data: dupe } = await c.sb.from('tool_aliases').select('id').eq('tool_id', toolId).ilike('alias', a).maybeSingle();
    if (dupe) return { ok: true, msg: 'Already learned.' };
    const { error } = await c.sb.from('tool_aliases').insert({ tool_id: toolId, alias: a, created_by: c.user.id });
    if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/81_tool_registry.sql first.' : error.message };
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  revalidatePath('/tools');
  return { ok: true, msg: `Learned “${a}”.` };
}

// Manager: add a tool to the registry.
export async function addTool(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'Managers add tools.' };
  const name = clean(form.get('name'), 80);
  if (!name) return { ok: false, msg: 'Tool name required.' };
  const { data, error } = await c.sb.from('tools').insert({ name, category: clean(form.get('category'), 40) || null, serial: clean(form.get('serial'), 60) || null, identifier: clean(form.get('identifier'), 60) || null, status: 'on_van' }).select('id').single();
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/81_tool_registry.sql first.' : error.message };
  // optional first alias
  const a = clean(form.get('alias'), 60);
  if (a && data) { try { await c.sb.from('tool_aliases').insert({ tool_id: data.id, alias: a, created_by: c.user.id }); } catch (_) {} }
  revalidatePath('/tools');
  return { ok: true };
}

// Manager: set who holds a tool + status (assign / on van / lost / shop).
export async function setHolder(toolId, holder, status) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'Managers reassign tools.' };
  const patch = { assigned_to: clean(holder, 60) || null, holder_since: new Date().toISOString() };
  if (status) patch.status = clean(status, 20);
  const { error } = await c.sb.from('tools').update(patch).eq('id', toolId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tools');
  return { ok: true };
}

// Any tech: ask the current holder for a tool — logs it so the holder/office sees the request.
export async function requestTool(toolId, toolName, holder) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'tool.requested', entity: 'tool', entity_id: String(toolId), detail: { tool: clean(toolName, 80), from: clean(holder, 60) } }); } catch (_) { return { ok: false, msg: 'Couldn’t send the request.' }; }
  return { ok: true, msg: holder ? `Asked ${holder} for it.` : 'Request logged for the office.' };
}
