import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { isAdminConfigured } from '@/lib/supabaseAdmin';
import { findDuplicateCustomers } from './actions';
import ReconcileClient from './ReconcileClient';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🔗 Merge Duplicates</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  if (!profile || profile.active === false || !can(profile.role, 'seeFinancials')) {
    return <div className="wrap"><div className="h1">🔗 Merge Duplicates</div><div className="notice">Your role can’t reconcile customers. Ask an owner or accounting.</div></div>;
  }

  const res = await findDuplicateCustomers();

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">🔗 Merge Duplicates</div>
      <p className="muted">Same customer entered twice — usually a soft-test record that matches an imported ServiceTitan one. Pick which to keep; the other’s invoices, jobs, and history move onto it, then it’s removed. Nothing is lost.</p>
      <ReconcileClient initial={res.ok ? res : { groups: [] }} />
    </div>
  );
}
