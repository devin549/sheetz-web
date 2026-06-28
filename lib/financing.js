// ── Financing framing for the customer close ("as low as $X/mo") ────────────────────────────────────────
// HOUSE RULES (hard):
//   • NEVER move the quoted price. Financing is a PAYMENT FRAME of the SAME total, not a discount.
//   • NEVER fabricate a monthly number. A "$X/mo" appears ONLY when a real partner term is configured.
//   • If no partner is configured → an HONEST "ask about low monthly payments" with NO number. We do NOT
//     resurrect the old fake "÷ 24" — a made-up payment is a lie about money, which is exactly what we don't do.
//
// Partners are gated behind env keys: WISETACK_API_KEY and/or SYNCHRONY_* (SYNCHRONY_API_KEY at minimum).
// When a key exists we expose the partner's STANDARD TERMS (APR + months) so the close can show a real
// estimated monthly payment + an apply link. The real quote/apply API call is a clearly-marked STUB
// (estimateMonthlyPayment uses the standard amortization formula on the partner's published terms) — swap in
// the live partner endpoint when the integration is wired. The math here is correct regardless.

// Standard term assumptions per partner. These are conservative, public-style terms used to COMPUTE an
// "as low as" estimate — the binding number always comes from the partner at apply-time. Override via env.
const PARTNER_TERMS = {
  wisetack:  { months: 60, aprPct: 9.99 },   // Wisetack home-improvement financing, typical longest-term promo
  synchrony: { months: 60, aprPct: 9.99 },   // Synchrony / CareCredit-style home services
};

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Which financing partner (if any) is configured. Returns null when no key is set → close shows the
// honest no-number prompt. WISETACK takes precedence if both are set.
export function financingPartner() {
  if (process.env.WISETACK_API_KEY) {
    return {
      slug: 'wisetack', name: 'Wisetack',
      months: envNum('WISETACK_TERM_MONTHS', PARTNER_TERMS.wisetack.months),
      aprPct: envNum('WISETACK_APR_PCT', PARTNER_TERMS.wisetack.aprPct),
      applyUrl: process.env.WISETACK_APPLY_URL || null,
    };
  }
  if (process.env.SYNCHRONY_API_KEY) {
    return {
      slug: 'synchrony', name: 'Synchrony',
      months: envNum('SYNCHRONY_TERM_MONTHS', PARTNER_TERMS.synchrony.months),
      aprPct: envNum('SYNCHRONY_APR_PCT', PARTNER_TERMS.synchrony.aprPct),
      applyUrl: process.env.SYNCHRONY_APPLY_URL || null,
    };
  }
  return null;
}

// Pure amortized monthly payment for `principal` over `months` at annual `aprPct`.
//   M = P · r(1+r)^n / ((1+r)^n − 1),  r = monthly rate.  apr 0 → straight division.
// Rounds UP to the nearest dollar so the displayed "as low as" is never optimistic (honest framing).
export function estimateMonthlyPayment(principal, months, aprPct) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.round(Number(months) || 0));
  const apr = Math.max(0, Number(aprPct) || 0);
  if (P <= 0) return 0;
  if (apr === 0) return Math.ceil(P / n);
  const r = apr / 100 / 12;
  const factor = Math.pow(1 + r, n);
  const m = (P * r * factor) / (factor - 1);
  return Math.ceil(m);
}

// Build the customer-safe financing offer for ONE tier total. Pure given a `partner` (pass the result of
// financingPartner(), or null). Threshold keeps tiny tickets from showing financing noise.
//   • partner + total ≥ minTotal → { available:true, hasQuote:true, monthly, months, aprPct, applyUrl }
//   • no partner (but total ≥ minTotal) → { available:true, hasQuote:false }  (honest, NO number)
//   • below threshold → { available:false }
export function financingOffer(total, partner, opts = {}) {
  const minTotal = Number.isFinite(opts.minTotal) ? opts.minTotal : 600;
  const t = Number(total) || 0;
  if (t < minTotal) return { available: false };
  if (!partner) return { available: true, hasQuote: false };
  const monthly = estimateMonthlyPayment(t, partner.months, partner.aprPct);
  return {
    available: true, hasQuote: true, monthly,
    months: partner.months, aprPct: partner.aprPct,
    partner: partner.name, applyUrl: partner.applyUrl || null,
  };
}
