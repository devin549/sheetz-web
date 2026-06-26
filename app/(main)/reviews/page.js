import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import ReviewsClient from './ReviewsClient';
import TechReviews from './TechReviews';

export const dynamic = 'force-dynamic';

const OFFICE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'marketing', 'sales'];
const FIELD = ['tech', 'helper', 'foreman', 'fs'];

export default async function Reviews() {
  // Field roles now reach Reviews too — but they see THEIR OWN reviews (the HTML iPad pane), not the log.
  const { role, profile } = await requireRole([...OFFICE, ...FIELD]);
  const isField = FIELD.includes(String(role || '').toLowerCase()) && !OFFICE.includes(String(role || '').toLowerCase());

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Reviews</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // ── TECH-SIDE: your own reviews + reputation + dispute (matches the HTML, not the office log) ──
  if (isField) {
    const name = profile.name || '';
    let rows = [];
    let sel = 'id, customer_name, rating, text, source, tech_name, created_at, disputed, dispute_status';
    let res = await sb.from('reviews').select(sel).ilike('tech_name', name).order('created_at', { ascending: false }).limit(100);
    if (res.error && /column|schema cache|does not exist/i.test(res.error.message || '')) {
      res = await sb.from('reviews').select('id, customer_name, rating, text, source, tech_name, created_at').ilike('tech_name', name).order('created_at', { ascending: false }).limit(100);
    }
    rows = res.error ? [] : (res.data || []);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const stats = {
      count: rows.length,
      sum: rows.reduce((s, r) => s + (Number(r.rating) || 0), 0),
      five: rows.filter((r) => Number(r.rating) === 5).length,
      week: rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length,
    };
    const reviewUrl = process.env.GOOGLE_REVIEW_URL || process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || '';
    return (
      <div className="wrap" style={{ maxWidth: 560 }}>
        <div className="h1" style={{ fontSize: 20 }}>⭐ My Reviews</div>
        <p className="muted" style={{ fontSize: 12.5 }}>Your reputation — what customers said about your work. Every 5★ climbs the Review Race.</p>
        {res.error && <div className="notice">Reviews need their table — run <code>supabase/37_reviews.sql</code>.</div>}
        <TechReviews reviews={rows} stats={stats} reviewUrl={reviewUrl} />
      </div>
    );
  }

  // ── OFFICE: the review LOG (unchanged) ──
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
