// Canonical Clog Busterz pay engine — the real structure (the 2-week breakdown). ONE source of truth
// for the tech /pay screen and the payroll run, so they never drift. All money in CENTS.
//
// Per job (commission / hourly_comm):
//   markup   = material_cost <= threshold ? markup_low : markup_high          (2× ≤$399, else 1.5×)
//   premium% = material_cost <= threshold ? premium_low_pct : premium_high_pct (10% ≤$399, else 5%)
//   materialMarkedUp = material_cost × markup
//   subtotal   = revenue − min(dispatch_fee, dispatch_fee_cap) − materialMarkedUp
//   commission = max(0, subtotal) × (commission_pct / 100)
//   premium    = materialMarkedUp × (premium% / 100)
//   jobPay     = commission + premium
// Commission techs are commission-ONLY — the hourly rate is PTO/holiday pay, NEVER stacked on job time.

export const CB_STRUCTURE = {
  name: 'cb', label: 'Clog Busterz (default)',
  dispatch_fee_cap_cents: 12500, material_threshold_cents: 39900,
  markup_low: 2.0, markup_high: 1.5, premium_low_pct: 10, premium_high_pct: 5, default_commission_pct: 0,
};

const r2 = (n) => Math.round(n);

// One job → its commission + premium breakdown (cents). revenue/material/dispatch in CENTS.
export function computeJobPay(job, commissionPct, st = CB_STRUCTURE) {
  const revenue = Math.max(0, Number(job.revenue_cents) || 0);
  const material = Math.max(0, Number(job.material_cost_cents) || 0);
  const dispatch = Math.min(Math.max(0, Number(job.dispatch_fee_cents) || 0), st.dispatch_fee_cap_cents);
  const lowTier = material <= st.material_threshold_cents;
  const markup = lowTier ? st.markup_low : st.markup_high;
  const premiumPct = lowTier ? st.premium_low_pct : st.premium_high_pct;
  const materialMarkedUp = r2(material * markup);
  const subtotal = revenue - dispatch - materialMarkedUp;
  const commission = r2(Math.max(0, subtotal) * (Number(commissionPct) || 0) / 100);
  const premium = r2(materialMarkedUp * (Number(premiumPct) || 0) / 100);
  return { revenue, material, dispatch, markup, premiumPct, materialMarkedUp, subtotal, commission, premium, jobPay: commission + premium };
}

// A week of jobs + the tech's profile → full gross breakdown (cents). `grants` = award_grants this
// week (amount_cents; negative = deduction). `hours`/`ptoHours` optional (entered by office).
export function computeWeeklyPay({ jobs = [], profile = {}, structure = CB_STRUCTURE, grants = [], hours = 0, ptoHours = 0 }) {
  const payType = profile.pay_type || 'commission';
  const rate = Number(profile.commission_pct) || Number(structure.default_commission_pct) || 0;
  const lines = jobs.map((j) => computeJobPay(j, rate, structure));

  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const dispatchFees = lines.reduce((s, l) => s + l.dispatch, 0);
  const materialDeduction = lines.reduce((s, l) => s + l.materialMarkedUp, 0);
  const commission = lines.reduce((s, l) => s + l.commission, 0);
  const premium = lines.reduce((s, l) => s + l.premium, 0);
  const jobPay = commission + premium;

  // Hourly: commission techs DON'T earn hourly on job time (PTO/holiday only). hourly/hourly_comm do.
  const hourlyRate = Number(profile.hourly_rate) || 0;
  const ptoPay = r2((Number(ptoHours) || 0) * hourlyRate * 100);
  const hourlyJobPay = ['hourly', 'hourly_comm'].includes(payType) ? r2((Number(hours) || 0) * hourlyRate * 100) : 0;
  const salaryBase = payType === 'salary' ? r2((Number(profile.weekly_salary) || 0) * 100) : 0;

  const bonuses = grants.filter((g) => (Number(g.amount_cents) || 0) > 0).reduce((s, g) => s + Number(g.amount_cents), 0);
  const deductions = grants.filter((g) => (Number(g.amount_cents) || 0) < 0).reduce((s, g) => s + Number(g.amount_cents), 0); // negative

  let base = 0;
  if (payType === 'salary') base = salaryBase;
  else if (payType === 'hourly') base = hourlyJobPay;
  else if (payType === 'hourly_comm') base = jobPay + hourlyJobPay;
  else base = jobPay; // commission-only

  const gross = base + ptoPay + bonuses + deductions; // deductions are negative
  return {
    payType, rate, jobsCount: jobs.length, revenue, dispatchFees, materialDeduction,
    commission, premium, jobPay, hourlyJobPay, ptoPay, salaryBase, bonuses, deductions,
    gross: Math.max(0, gross), lines,
    materialEntered: lines.some((l) => l.material > 0),
  };
}

export const dollars = (cents) => '$' + (Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
