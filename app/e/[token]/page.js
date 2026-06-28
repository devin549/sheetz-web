import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import CustomerEstimate from './CustomerEstimate';

export const dynamic = 'force-dynamic';

// PUBLIC customer estimate — opened from a texted link OR shown on the tech's iPad. Clean, picture-forward
// "checkout", never the internal cart. Authenticated by the token only.
export default async function PublicEstimate({ params }) {
  const wrap = (inner) => <div style={{ minHeight: '100vh', background: '#0e0f12', color: '#f4f1ea', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>{inner}</div>;
  if (!isAdminConfigured) return wrap(<div style={{ marginTop: 80 }}>This estimate link isn’t available right now.</div>);

  const sb = getSupabaseAdmin();
  let est = null;
  try { const { data } = await sb.from('pricebook_estimates').select('*').eq('token', params.token).maybeSingle(); est = data; } catch (_) {}
  if (!est) return wrap(<div style={{ marginTop: 80, textAlign: 'center', maxWidth: 360 }}><div style={{ fontSize: 40 }}>🔧</div><h2>Estimate not found</h2><p style={{ opacity: 0.7 }}>This link may have expired. Text your technician and they’ll send a fresh one.</p></div>);

  // Mark viewed (first open) + drop a proof-timeline event.
  if (est.status === 'sent') {
    try { await sb.from('pricebook_estimates').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', est.id).eq('status', 'sent'); } catch (_) {}
    try { await sb.from('pricebook_estimate_events').insert({ estimate_id: est.id, token: est.token, event_type: 'viewed', method: 'link', actor: est.customer_name || 'Customer', actor_role: 'customer' }); } catch (_) {}
  }

  // Customer-safe projection — strip the hidden itemId etc.
  const safeLine = (l) => ({ name: l.name, description: l.description, price: Number(l.price) || 0, photo: l.photo || null, gallery: Array.isArray(l.gallery) ? l.gallery : [], warranty: l.warranty || '', pdf: l.pdf || null });
  const lines = (Array.isArray(est.lines) ? est.lines : []).map(safeLine);

  // The Good/Better/Best ladder, customer-safe (no itemId/cost/margin). Empty on old single-tier links →
  // CustomerEstimate falls back to the flat view. Order Good→Better→Best so the hero (recommended) lands mid.
  const ORDER = { good: 0, better: 1, best: 2 };
  const tiers = (Array.isArray(est.tiers) ? est.tiers : [])
    .map((t) => ({
      key: t.key, name: t.name || '', icon: t.icon || '🔧', pitch: t.pitch || '', bestFor: t.bestFor || '',
      warranty: t.warranty || '', recommended: !!t.recommended, mostChosen: !!t.mostChosen,
      includes: Array.isArray(t.includes) ? t.includes : [],
      lines: (Array.isArray(t.lines) ? t.lines : []).map(safeLine),
      subtotal: Number(t.subtotal) || (Array.isArray(t.lines) ? t.lines.reduce((s, l) => s + (Number(l.price) || 0), 0) : 0),
    }))
    .filter((t) => t.lines.length)
    .sort((a, b) => (ORDER[a.key] ?? 9) - (ORDER[b.key] ?? 9));

  const safe = {
    token: est.token, customerName: est.customer_name || '', techName: est.tech_name || '',
    headline: est.headline || '', customerDescription: est.customer_description || '', warranty: est.warranty_text || '',
    approveText: est.approve_text || 'Approve & Schedule', lines, tiers, selectedTierKey: est.selected_tier_key || '',
    subtotal: Number(est.subtotal) || 0, cardFee: Number(est.card_fee) || 0,
    status: est.status, declineReason: est.decline_reason || '',
    approvedName: est.approved_name || '', approvalMethod: est.approval_method || '',
    approvedAt: est.responded_at || '', consentText: est.consent_text || '',
  };

  return wrap(<CustomerEstimate est={safe} />);
}
