// lib/powerPlunger.js — Power Plunger Hour "roll for a bonus" engine.
// Techs earn pulls from real money-making actions (5★ reviews, membership sales); each pull can win a
// small cash bonus, HARD-CAPPED at the owner-set company budget. Winnings are LOGGED here (paid=false) and
// routed to payroll approval — NEVER auto-paid. Every economic value comes from the owner-editable
// power_plunger_config row, so the owner changes top prize / budget / earn rules with no code change.
// Server-only. All DB calls fail-soft.

const DEFAULT_CONFIG = {
  top_prize: 15, budget_cap: 200, budget_period: 'month',
  earn_membership: true, earn_five_star: true, earn_big_job: false, big_job_min: 500, active: true,
};

export async function getConfig(sb) {
  try {
    const { data } = await sb.from('power_plunger_config').select('*').eq('id', 1).maybeSingle();
    return { ...DEFAULT_CONFIG, ...(data || {}) };
  } catch { return { ...DEFAULT_CONFIG }; }
}

// Budget accounting key. Month → 'YYYY-MM'; week → 'YYYY-MM-DD' of the CB week's Sunday.
export function periodKey(period, now = new Date()) {
  const d = new Date(now);
  if (period === 'week') return weekStartISO(now).slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Most recent Sunday 00:00 UTC (the CB week boundary) as an ISO string.
export function weekStartISO(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // back up to Sunday
  return d.toISOString();
}

// $ already paid out (won) this budget period — drives the cap.
export async function budgetSpent(sb, period, now = new Date()) {
  const pk = periodKey(period, now);
  try {
    const { data } = await sb.from('power_plunger_pulls').select('amount').eq('budget_period', pk);
    return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  } catch { return 0; }
}

// How many pulls a tech has earned this week, minus the ones they've already used.
export async function pullsAvailable(sb, { techId, name }, cfg, now = new Date()) {
  const wk = weekStartISO(now);
  let earned = 0;
  if (cfg.earn_five_star && name) {
    try {
      const { count } = await sb.from('reviews').select('id', { count: 'exact', head: true }).eq('rating', 5).eq('tech_name', name).gte('created_at', wk);
      earned += count || 0;
    } catch (_) {}
  }
  if (cfg.earn_membership) {
    // Membership attribution column varies — try the likely ones, fail-soft.
    for (const col of ['sold_by_id', 'sold_by', 'tech_id', 'tech_name']) {
      const val = col.endsWith('_id') ? techId : (col === 'tech_name' || col === 'sold_by' ? name : techId);
      if (!val) continue;
      try {
        const { count, error } = await sb.from('memberships').select('id', { count: 'exact', head: true }).eq(col, val).gte('created_at', wk);
        if (!error) { earned += count || 0; break; }
      } catch (_) {}
    }
  }
  let used = 0;
  try {
    const idCol = techId ? 'tech_id' : 'tech_name';
    const idVal = techId || name;
    const { count } = await sb.from('power_plunger_pulls').select('id', { count: 'exact', head: true }).eq(idCol, idVal).gte('created_at', wk);
    used = count || 0;
  } catch (_) {}
  return Math.max(0, earned - used);
}

const SYMS = ['💵', '🪠', '7', '💎', '👑', '🎰', '🔥', '⭐'];
const pick = () => SYMS[Math.floor(Math.random() * SYMS.length)];

// Weighted slot outcome, never exceeding the remaining budget. Avg ≈ $3–4/pull (tunable via config top_prize).
export function rollOutcome(cfg, budgetLeft) {
  const top = Number(cfg.top_prize) || 15;
  const r = Math.random();
  let amount = 0;
  if (r > 0.96) amount = top;                       // ~4% jackpot (top prize)
  else if (r > 0.80) amount = Math.min(10, top);    // ~16% mid
  else if (r > 0.55) amount = Math.min(5, top);     // ~25% small
  // else ~55% no hit
  amount = Math.min(amount, Math.max(0, Number(budgetLeft) || 0)); // cap: never overspend
  const hit = amount > 0;
  const jackpot = hit && amount >= top;
  const symbols = jackpot ? ['👑', '👑', '👑'] : hit ? ['💵', '💵', '💵'] : [pick(), pick(), pick()];
  return { hit, amount, jackpot, symbols: symbols.join(' ') };
}

// Orchestrate one pull: checks active + earned pulls + budget, records the result, returns the outcome.
export async function doPull(sb, tech, now = new Date()) {
  const cfg = await getConfig(sb);
  if (!cfg.active) return { ok: false, reason: 'off', msg: 'The Power Plunger is paused right now.' };
  const avail = await pullsAvailable(sb, tech, cfg, now);
  if (avail <= 0) return { ok: false, reason: 'no_pulls', msg: 'No pulls yet — sell a membership or land a 5★ review to earn one!' };
  const spent = await budgetSpent(sb, cfg.budget_period, now);
  const budgetLeft = Math.max(0, Number(cfg.budget_cap) - spent);
  const out = rollOutcome(cfg, budgetLeft);
  const pk = periodKey(cfg.budget_period, now);
  let pullId = null;
  try {
    const { data } = await sb.from('power_plunger_pulls')
      .insert({ tech_id: tech.techId || null, tech_name: tech.name || null, reason: 'earned', amount: out.amount, hit: out.hit, symbols: out.symbols, budget_period: pk })
      .select('id').maybeSingle();
    pullId = data?.id || null;
  } catch (_) {}
  const budgetTapped = budgetLeft <= 0;
  return {
    ok: true, pullId, hit: out.hit, amount: out.amount, jackpot: out.jackpot, symbols: out.symbols,
    pullsLeft: Math.max(0, avail - 1), budgetTapped,
    msg: out.jackpot ? `🎰 JACKPOT! $${out.amount} — pending payroll approval.`
      : out.hit ? `Nice — $${out.amount}! It'll show on your check after the office approves it.`
      : budgetTapped ? "This week's prize budget is tapped — pulls reset Sunday. Still spun for fun!"
      : 'So close! No hit that time — earn another pull and try again.',
  };
}
