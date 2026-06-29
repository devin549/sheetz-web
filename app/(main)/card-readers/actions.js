'use server';

// Card-reader admin — pair a WisePOS E to our Stripe account, pick the shop default, remove a lost one.
// Owner/manager only. Pairing uses the 3-word code the reader shows under Settings → "Generate pairing code".
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { isStripeConfigured, ensureTerminalLocation, registerTerminalReader } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

async function gateAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { err: 'Not signed in.' };
  if (!(can(profile.role, 'manageUsers') || can(profile.role, 'manageInventory') || can(profile.role, 'seeFinancials'))) return { err: 'Owner/manager only.' };
  return { user, profile };
}

export async function pairReader(formData) {
  const g = await gateAdmin();
  if (g.err) return { ok: false, msg: g.err };
  if (!isStripeConfigured()) return { ok: false, msg: 'Add STRIPE_SECRET_KEY in Vercel first.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const code = String(formData.get('code') || '').trim();
  const label = String(formData.get('label') || '').trim().slice(0, 60) || null;
  if (!code) return { ok: false, msg: 'Enter the pairing code from the reader screen.' };

  const loc = await ensureTerminalLocation();
  if (!loc.ok) return { ok: false, msg: 'Stripe location: ' + loc.error };

  const reg = await registerTerminalReader({ registrationCode: code, label, locationId: loc.id });
  if (!reg.ok) return { ok: false, msg: 'Stripe: ' + reg.error };

  try {
    // First reader paired becomes the default automatically.
    const { count } = await sb.from('terminal_readers').select('id', { count: 'exact', head: true });
    const makeDefault = (count || 0) === 0;
    const { error } = await sb.from('terminal_readers').insert({
      id: reg.id, label: reg.label || label, location_id: loc.id, status: reg.status || null,
      is_default: makeDefault, registered_by: g.profile.name || g.profile.email || null, last_seen: new Date().toISOString(),
    });
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) return { ok: false, msg: 'Run migration 123_terminal_readers.sql first.' }; return { ok: false, msg: error.message }; }
  } catch (e) { return { ok: false, msg: String((e && e.message) || e).slice(0, 160) }; }

  revalidatePath('/card-readers');
  return { ok: true, msg: `Paired “${reg.label || label || reg.id}”.` };
}

export async function setDefaultReader(id) {
  const g = await gateAdmin();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  try {
    await sb.from('terminal_readers').update({ is_default: false }).eq('is_default', true);
    const { error } = await sb.from('terminal_readers').update({ is_default: true }).eq('id', id);
    if (error) return { ok: false, msg: error.message };
  } catch (e) { return { ok: false, msg: String((e && e.message) || e).slice(0, 160) }; }
  revalidatePath('/card-readers');
  return { ok: true, msg: 'Default reader set.' };
}

export async function unpairReader(id) {
  const g = await gateAdmin();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  try { const { error } = await sb.from('terminal_readers').delete().eq('id', id); if (error) return { ok: false, msg: error.message }; }
  catch (e) { return { ok: false, msg: String((e && e.message) || e).slice(0, 160) }; }
  revalidatePath('/card-readers');
  return { ok: true, msg: 'Reader removed.' };
}
