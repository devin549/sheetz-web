import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { isAiConfigured } from '@/lib/anthropic';
import ContentClient from './ContentClient';

export const dynamic = 'force-dynamic';

export default async function Content() {
  const { role } = await requirePerm('seeReports', 'manageUsers', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">✍️ Content Engine</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let ideas = [], needsMig = false;
  try {
    const { data, error } = await sb.from('content_ideas').select('id, title, target_keyword, target_town, rationale, draft, status, published_url, created_at').order('created_at', { ascending: false }).limit(200);
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMig = true; } else ideas = data || [];
  } catch { needsMig = true; }

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1" style={{ marginBottom: 2 }}>✍️ SEO Content Engine</div>
      <p className="muted" style={{ fontSize: 13 }}>AI-recommended local blog posts that attack your rank gaps (Lexington, Nicholasville, hydro jetting…) — generate ideas, draft them, publish to grow.</p>
      {needsMig && <div className="notice">Run <code>supabase/110_content_ideas.sql</code> to save ideas.</div>}
      <ContentClient ideas={ideas} aiReady={isAiConfigured(role)} disabled={needsMig} />
    </div>
  );
}
