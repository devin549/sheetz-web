import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { isAdminConfigured } from '@/lib/supabaseAdmin';
import { IMPORT_KINDS, kindMeta } from '@/lib/importKinds';
import ImportCenter from './ImportCenter';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  const role = profile && profile.role;

  // Only show the kinds this role is allowed to import (each action re-checks too).
  const kinds = (profile && profile.active !== false)
    ? IMPORT_KINDS.filter((k) => can(role, k.cap)).map(kindMeta)
    : [];

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">📥 Import Center</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to import data.</div></div>;
  }
  if (!kinds.length) {
    return <div className="wrap"><div className="h1">📥 Import Center</div><div className="notice">Your role can’t import data. Ask an owner or office manager.</div></div>;
  }

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">📥 Import Center</div>
      <p className="muted">Bring data in from a CSV — paste it or pick a file. Columns are auto-matched; preview before it writes. Imports are idempotent, so re-running the same file won’t make duplicates.</p>
      <ImportCenter kinds={kinds} />
    </div>
  );
}
