import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { roleOf } from '@/lib/nav';

// Page-level guard: ensures a signed-in user whose role is allowed; else bounces.
// Defense-in-depth on top of the middleware + sidebar (a tech can't just type /customers).
export async function requireRole(allowed) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const role = roleOf(user);
  if (allowed && allowed.length && !allowed.includes(role)) redirect('/');
  return { user, role };
}
