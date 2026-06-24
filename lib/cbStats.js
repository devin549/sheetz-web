// CB average ticket per service (completed jobs with a dollar amount) — the baseline the pricing
// radar compares competitor prices against. Server-side; takes a Supabase admin client.
export async function cbAvgTickets(sb) {
  const agg = {};
  try {
    for (let from = 0; from < 8000; from += 1000) {
      const { data, error } = await sb.from('jobs').select('job_type, amount').gt('amount', 0).range(from, from + 999);
      if (error || !data || !data.length) break;
      for (const j of data) { const k = String(j.job_type || '').trim() || 'Other'; (agg[k] = agg[k] || { sum: 0, n: 0 }); agg[k].sum += Number(j.amount) || 0; agg[k].n++; }
      if (data.length < 1000) break;
    }
  } catch { /* ignore */ }
  return Object.entries(agg).map(([service, v]) => ({ service, avg: Math.round(v.sum / v.n), jobs: v.n })).sort((a, b) => b.jobs - a.jobs).slice(0, 12);
}
