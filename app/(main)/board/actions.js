'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

// Re-check the caller can assign jobs on every call — a server action is a public RPC, so
// guarding only the page/nav isn't enough.
async function assertAssigner() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !can(roleOf(user), 'assignJobs')) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return sb;
}

// Assign (or unassign) a tech to a job. techId '' or null = unassign. Optional `hour` (a float,
// e.g. 13.5 = 1:30pm) reschedules the job to TODAY at that time — used when dragging a job onto
// the grid. Sets the FK (tech_id, so My Day + the board embed resolve) + denormalized tech_name.
export async function assignTech(jobId, techId, hour) {
  let sb;
  try { sb = await assertAssigner(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!jobId) return { ok: false, msg: 'No job.' };

  let techName = null;
  if (techId) {
    const { data } = await sb.from('techs').select('name').eq('id', techId).maybeSingle();
    techName = (data && data.name) || null;
  }
  const patch = {
    tech_id: techId || null,
    tech_name: techName,
    assigned_at: techId ? new Date().toISOString() : null,
  };
  if (hour != null && !Number.isNaN(Number(hour))) {
    const d = new Date();
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    patch.scheduled_at = d.toISOString();
  }
  const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/board');
  return { ok: true };
}
