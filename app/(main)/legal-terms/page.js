import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { getLegalTerms } from '@/lib/estimateTerms';
import LegalTermsEditor from './LegalTermsEditor';

export const dynamic = 'force-dynamic';

// ⚖️ Owner-editable legal terms — change the attorney language (Work Authorization + Completion Acceptance)
// without a code deploy. Owner / GM only.
export default async function LegalTermsPage() {
  await requirePerm('manageUsers');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Legal terms</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const [auth, completion] = await Promise.all([getLegalTerms(sb, 'work_authorization'), getLegalTerms(sb, 'completion_acceptance')]);

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">⚖️ Legal terms</div>
      <p className="muted" style={{ fontSize: 13 }}>Edit the language your customers read &amp; sign. Saving bumps the version and takes effect on new estimates immediately — anything already signed keeps the version it was approved under. Have your attorney review changes.</p>
      <LegalTermsEditor
        auth={{ content: auth.content, version: auth.version }}
        completion={{ content: completion.content, version: completion.version }}
      />
    </div>
  );
}
