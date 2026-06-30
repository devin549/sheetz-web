// Per-machine P&L: earned (revenue from the jobs it worked, via equipment_job_use) minus costs (purchase +
// service) = net. Plus financing status. All money returned in DOLLARS. Best-effort; safe before mig 148.
export async function equipmentPnl(sb) {
  let units = [];
  try { const { data } = await sb.from('equipment_fleet').select('id, model, unit_label, purchase_cents, monthly_cents, payoff_cents, paid_off, financed').eq('active', true).order('unit_label'); units = data || []; }
  catch (_) { return []; }
  if (!units.length) return [];
  const ids = units.map((u) => u.id);

  // service cost per unit
  const svc = {};
  try { const { data } = await sb.from('equipment_service').select('unit_id, cost_cents').in('unit_id', ids); (data || []).forEach((s) => { svc[s.unit_id] = (svc[s.unit_id] || 0) + (Number(s.cost_cents) || 0); }); } catch (_) {}

  // jobs each unit worked (distinct via the table's unique constraint)
  const linksByUnit = {}; const allJobIds = new Set();
  try { const { data } = await sb.from('equipment_job_use').select('unit_id, job_id, job_number').in('unit_id', ids); (data || []).forEach((r) => { (linksByUnit[r.unit_id] = linksByUnit[r.unit_id] || []).push(r); if (r.job_id) allJobIds.add(r.job_id); }); } catch (_) {}

  // revenue per linked job — the job's value (jobs.amount, dollars)
  const jobRev = {};
  if (allJobIds.size) { try { const { data } = await sb.from('jobs').select('id, amount').in('id', [...allJobIds]); (data || []).forEach((j) => { jobRev[j.id] = Number(j.amount) || 0; }); } catch (_) {} }

  return units.map((u) => {
    const links = linksByUnit[u.id] || [];
    const earned = links.reduce((a, l) => a + (jobRev[l.job_id] || 0), 0);
    const service = (svc[u.id] || 0) / 100;
    const purchase = (Number(u.purchase_cents) || 0) / 100;
    const costs = purchase + service;
    return {
      id: u.id, model: u.model, unit_label: u.unit_label,
      jobs: links.length, earned, service, purchase, costs, net: earned - costs,
      paid_off: !!u.paid_off, financed: !!u.financed,
      payoff: (Number(u.payoff_cents) || 0) / 100, monthly: (Number(u.monthly_cents) || 0) / 100,
    };
  });
}
