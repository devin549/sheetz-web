import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import ReviewsClient from './ReviewsClient';

export const dynamic = 'force-dynamic';

export default async function Reviews() {
  await requireRole(['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Reviews</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('reviews')
    .select('id, customer_name, rating, text, source, tech_name, responded, created_at')
    .order('created_at', { ascending: false }).limit(200);

  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 880 }}>
        <div className="h1">Reviews</div>
        <p className="muted">Log customer reviews → weekly count feeds the board&apos;s Game Plan; low ratings drive Customer Recovery.</p>
        <div className="notice">Reviews need their table — run <code>supabase/37_reviews.sql</code> in Supabase, then this fills in.</div>
      </div>
    );
  }
  let techsData = (await sb.from('techs').select('id, name').order('name')).data || [];
  const techs = techsData.map((t) => ({ id: t.id, name: t.name })).filter((t) => t.name);

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Reviews</div>
      <p className="muted">Log customer reviews → this week&apos;s count feeds the board&apos;s Game Plan. 1–3★ get flagged for Customer Recovery.</p>
      <ReviewsClient rows={res.data || []} techs={techs} />
    </div>
  );
}
