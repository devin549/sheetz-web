// Projects data layer — a Project is one multi-unit job at a site for one payer; its VISITS are the linked
// `jobs` rows, grouped by UNIT. Margin rolls up from the visits. All fail-soft (returns empty/zero rather
// than throwing) so the screens render before every column/table is populated.
const DONE = (s) => /done|complete|closed/.test(String(s || '').toLowerCase());
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

function rollupMargin(jobs) {
  let revenue = 0, cost = 0;
  for (const j of jobs) {
    if (DONE(j.status)) revenue += Number(j.amount) || 0;
    cost += ((Number(j.material_cost_cents) || 0) + (Number(j.dispatch_fee_cents) || 0)) / 100;
  }
  const pct = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : null;
  return { revenue, cost, marginPct: pct };
}

// Select project visits with cost columns, falling back if migration-73 cost cols aren't cache-visible.
async function loadVisits(sb, projectId) {
  const base = 'id, job_number, job_type, status, amount, scheduled_at, completed_at, project_unit_id, customer_id';
  let res = await sb.from('jobs').select(`${base}, material_cost_cents, dispatch_fee_cents`).eq('project_id', projectId).order('scheduled_at', { ascending: true });
  if (res.error) res = await sb.from('jobs').select(base).eq('project_id', projectId).order('scheduled_at', { ascending: true });
  return res.error ? [] : (res.data || []);
}

export async function loadProjects(sb) {
  try {
    const { data: projects, error } = await sb.from('projects').select('id, name, site_address, status, customer_id, target_completion, created_at').order('created_at', { ascending: false }).limit(100);
    if (error) return { available: false, rows: [] };
    const custIds = [...new Set((projects || []).map((p) => p.customer_id).filter(Boolean))];
    const custName = {};
    if (custIds.length) { try { const { data } = await sb.from('customers').select('id, name').in('id', custIds); (data || []).forEach((c) => { custName[c.id] = c.name; }); } catch (_) {} }
    // per-project visit counts + margin (one grouped query)
    const ids = (projects || []).map((p) => p.id);
    const byProject = {};
    if (ids.length) {
      let jr = await sb.from('jobs').select('project_id, status, amount, material_cost_cents, dispatch_fee_cents').in('project_id', ids);
      if (jr.error) jr = await sb.from('jobs').select('project_id, status, amount').in('project_id', ids);
      (jr.data || []).forEach((j) => { (byProject[j.project_id] = byProject[j.project_id] || []).push(j); });
    }
    const rows = (projects || []).map((p) => {
      const visits = byProject[p.id] || [];
      const m = rollupMargin(visits);
      return { ...p, payer: custName[p.customer_id] || '—', visits: visits.length, ...m };
    });
    return { available: true, rows };
  } catch { return { available: false, rows: [] }; }
}

export async function loadProject(sb, id) {
  const { data: project, error } = await sb.from('projects').select('*').eq('id', id).maybeSingle();
  if (error || !project) return null;
  let payer = null;
  if (project.customer_id) { try { const { data } = await sb.from('customers').select('name, phone, address').eq('id', project.customer_id).maybeSingle(); payer = data || null; } catch (_) {} }
  let units = [];
  try { const { data } = await sb.from('project_units').select('id, label, status, sort').eq('project_id', id).order('sort', { ascending: true }); units = data || []; } catch (_) {}
  const visits = await loadVisits(sb, id);
  // group visits by unit
  const byUnit = {}; const unassigned = [];
  visits.forEach((v) => { if (v.project_unit_id) (byUnit[v.project_unit_id] = byUnit[v.project_unit_id] || []).push(v); else unassigned.push(v); });
  const margin = rollupMargin(visits);
  return { project, payer, units, byUnit, unassigned, visits, margin };
}

export { money };
