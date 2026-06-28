// ── Clog Club member-savings DISPLAY for the customer close ─────────────────────────────────────────────
// HOUSE RULE: this NEVER moves the quoted price. It is a DISPLAY of what the customer WOULD save by joining
// the Clog Club at the EXISTING plan rate (membership_plans.discount_pct, ~15%). The banner is a NUDGE —
// tapping records interest / tells the office; it does not auto-enroll and does not auto-discount the quote.
//
// Pure + unit-testable. Given a tier total and a discount %, return the dollars saved on THIS job at that rate.

// Dollars saved on `total` at `discountPct` (0–100). Rounded to whole dollars (the close shows no cents).
// Defensive: bad/zero inputs → 0, never NaN.
export function memberSavings(total, discountPct) {
  const t = Number(total) || 0;
  const pct = Math.max(0, Math.min(100, Number(discountPct) || 0));
  if (t <= 0 || pct <= 0) return 0;
  return Math.round((t * pct) / 100);
}

// The member price for `total` at `discountPct` — what they'd pay AS a member. (Display only; the quoted
// price on the estimate is unchanged.) Rounded to whole dollars to match the close.
export function memberPrice(total, discountPct) {
  const t = Number(total) || 0;
  return Math.max(0, Math.round(t - memberSavings(t, discountPct)));
}

// Build the customer-safe member-savings offer for ONE tier total + a plan { name, discount_pct }.
//   • plan with discount_pct > 0 and savings > 0 → { show:true, planName, savings, memberPrice, discountPct }
//   • no plan / 0% / 0 savings → { show:false }   (render nothing)
export function memberOffer(total, plan) {
  const pct = Math.max(0, Math.min(100, Number(plan?.discount_pct) || 0));
  const savings = memberSavings(total, pct);
  if (!plan || pct <= 0 || savings <= 0) return { show: false };
  return {
    show: true,
    planName: plan.name || 'Clog Club',
    discountPct: pct,
    savings,
    memberPrice: memberPrice(total, pct),
  };
}
