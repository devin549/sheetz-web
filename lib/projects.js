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

// 🔔 Project radar — the SYSTEM finds likely projects so a manager verifies instead of every tech moving
// jobs. Two signals: (a) a customer/site with 3+ jobs in the last 120 days NOT already in a project;
// (b) jobs a tech flagged (audit_log 'project.flagged'). Returns candidates for one-click conversion.
export async function detectProjectCandidates(sb) {
  const out = { available: true, candidates: [], flagged: [] };
  try {
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const { data: jobs, error } = await sb.from('jobs')
      .select('id, job_number, job_type, scheduled_at, customer_id, project_id, customers(name, address)')
      .gte('scheduled_at', since).is('project_id', null).not('customer_id', 'is', null)
      .order('scheduled_at', { ascending: false }).limit(2000);
    if (error) return { available: false, candidates: [], flagged: [] };
    const byCust = {};
    (jobs || []).forEach((j) => { (byCust[j.customer_id] = byCust[j.customer_id] || []).push(j); });
    out.candidates = Object.values(byCust)
      .filter((arr) => arr.length >= 3)
      .map((arr) => ({
        customerId: arr[0].customer_id,
        name: (arr[0].customers && arr[0].customers.name) || 'Customer',
        address: (arr[0].customers && arr[0].customers.address) || '',
        count: arr.length,
        jobIds: arr.map((j) => j.id),
        recentTypes: [...new Set(arr.map((j) => j.job_type).filter(Boolean))].slice(0, 4),
      }))
      .sort((a, b) => b.count - a.count).slice(0, 15);
  } catch { return { available: false, candidates: [], flagged: [] }; }

  // Tech-flagged jobs awaiting a manager.
  try {
    const { data: flags } = await sb.from('audit_log').select('entity_id, actor_name, detail, created_at').eq('action', 'project.flagged').order('created_at', { ascending: false }).limit(30);
    const ids = [...new Set((flags || []).map((f) => String(f.entity_id)).filter(Boolean))];
    if (ids.length) {
      const { data: js } = await sb.from('jobs').select('id, job_type, project_id, customer_id, customers(name, address)').in('id', ids);
      const byId = {}; (js || []).forEach((j) => { byId[String(j.id)] = j; });
      const seen = new Set();
      (flags || []).forEach((f) => {
        const j = byId[String(f.entity_id)];
        if (!j || j.project_id || seen.has(String(f.entity_id))) return; // skip already-linked / dupes
        seen.add(String(f.entity_id));
        out.flagged.push({ jobId: j.id, jobType: j.job_type || 'Job', name: (j.customers && j.customers.name) || 'Customer', address: (j.customers && j.customers.address) || '', customerId: j.customer_id, by: f.actor_name, note: f.detail?.note || '', at: f.created_at });
      });
    }
  } catch (_) {}
  return out;
}

export { money };
