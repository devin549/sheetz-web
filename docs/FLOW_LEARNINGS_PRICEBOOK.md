# Flow Learnings — Pricebook + Good/Better/Best Estimate & Customer Close

_Flow-Learning agent · 2026-06-28 · how the best products sell, distilled into CB-native moves._

**Ethics line (held):** every item below is a PATTERN we observed in public material + the behavioral
PRINCIPLE behind it, then a CB-ORIGINAL way to do it in our amber brand and plumbing voice. No competitor
copy, assets, or screenshots were reproduced. We learn; we don't steal.

**Companion doc:** `PRICEBOOK_DEEP_DIVE.md` already diagnoses our current build (3 disconnected estimate
surfaces; the customer `/e/[token]` close collapses the tier ladder into one flat total). This doc is the
*outside-in* half: what the world does well and how we adapt it. Where the two agree, it's noted.

---

## The one structural finding that frames everything

Our tech-side builders (`/estimate`, `/job/[id]/pricebook`) have a genuine Good/Better/Best psychology
engine — middle tier recommended, "+$X to step up" deltas, ~$/mo, MOST POPULAR badge. But the **customer
close** (`app/e/[token]/CustomerEstimate.js`) renders a **flat list of line cards + one Total**. The ladder
dies before the customer's thumb ever sees it. Almost every pattern below converges on the same fix:
**the choice the customer makes should be a CB-original 3-option ladder, presented on the screen they tap.**

---

## Patterns → Principles → CB-native moves (prioritized)

### 1. Show the ladder ON the customer screen, not just the tech's
- **Pattern:** Field-service leaders convert the tech-built proposal into a clean customer-facing
  "presentation mode" that still shows multiple options side-by-side; visual Good/Better/Best proposals
  beat single-price text quotes on both close rate and ticket.
- **Principle:** Compromise effect + choice architecture — given three framed options people pick the
  middle far more than they'd pick a lone "take it or leave it" price; a single price is a yes/no, a ladder
  is a which-one.
- **Public source:** ServiceTitan, [Presenting Options — Contractor Playbook ch.10](https://www.servicetitan.com/guides/contractor-playbook/presenting-options); Housecall Pro, [Sales proposals / Good-Better-Best](https://www.housecallpro.com/features/price-book/) (one HVAC pro cited tune-up average rising from ~$159 flat to ~$237 with options, customers choosing the upper tiers ~60% of the time).
- **CB move:** Port the `/estimate` tier engine INTO `/e/[token]`. The texted/turned-iPad page renders 3
  CB-branded tier cards (🥉 Good / 🥈 Better / 🥇 Best), middle pre-highlighted with the amber border +
  "★ MOST POPULAR" we already style, each with its "+$X to step up" delta. Approve flow stays exactly as-is
  (type name + consent, no charge). **Highest impact, medium effort — the ladder code already exists; it
  just needs to reach the close screen and read from the real cart instead of a hardcoded SEED.**

### 2. Lead with the monthly number, not just the total
- **Pattern:** Home-services proposal tools surface an "as low as $X/mo" line on-screen; reps trained to
  lead with the monthly figure rather than bury the total in a PDF.
- **Principle:** Payment framing / pennies-a-day — a large lump sum triggers sticker shock; a small monthly
  number is compared against everyday expenses ("less than a car payment") and feels affordable.
- **Public source:** [Wisetack — customer financing for home services](https://www.wisetack.com/); [SubcontractorHub — contractor financing & close rates](https://www.subcontractorhub.com/blog/contractor-financing-options) (cites materially higher close rates and ticket when financing is led with, not bolted on).
- **CB move:** We ALREADY compute `~$/mo` (÷24) in `/estimate` but it never reaches the customer. Put an
  honest amber "or about $X/mo" under each tier total on `/e/[token]`, with a real divisor tied to a named
  partner (e.g. Wisetack) once chosen — and a one-line "see your real monthly" CTA. **Honesty rule: label
  it an estimate until a financing partner returns a real APR/term; never imply an approved rate we don't
  have.** Owner approves any term assumptions. Medium impact, low effort.

### 3. The middle tier is the hero — make the decoy do the work
- **Pattern:** SaaS 3-tier pricing pages put "Most Popular" on the middle plan and an expensive top plan as
  an anchor; adding a high anchor lifts middle-tier selection with zero feature change.
- **Principle:** Anchoring + asymmetric-dominance (decoy) + center-stage effect — the top tier reframes the
  middle as "the reasonable one"; visual emphasis on the middle compounds it. Reported lifts of ~12–35% to
  the targeted tier in public write-ups.
- **Public source:** [PayPro Global — price anchoring for SaaS](https://payproglobal.com/how-to/use-price-anchoring/); [Orbix Studio — SaaS pricing-page psychology](https://www.orbix.studio/blogs/saas-pricing-page-psychology-convert).
- **CB move:** Keep middle = recommended (we do). Add a deliberate, HONEST top tier worth its price — e.g.
  Best = unclog + camera scope + BioOne + the 1-yr warranty — so it genuinely anchors, never a fake throwaway.
  Plumbing voice on the badge: keep "★ MOST POPULAR" but consider a CB-voice subtitle like "what most
  neighbors pick." **Honesty rule: the top tier must be a real option a real customer would buy, not a
  pure decoy. Owner approves all three prices.** Low effort (we're 80% there), high leverage.

### 4. Sell the outcome on each tier, not the parts list
- **Pattern:** Strong proposals name each option by the *peace of mind* it buys ("total home comfort,"
  "peace of mind," "basic"), not by SKUs; the customer chooses a feeling, the line items justify it.
- **Principle:** Value framing + loss aversion — "so it doesn't come back" sells the avoided 2am callback;
  a parts list invites line-item haggling.
- **Public source:** ServiceTitan, [proposal labeling / custom tier names](https://www.servicetitan.com/blog/webinar-recap-back2basics-estimate-templates-101).
- **CB move:** Our SEED pitches already do this well ("Clears it AND a camera finds why — so it doesn't come
  back"). Make the `pitch` + `warranty` fields **first-class and required** in the bundle/tier data so every
  customer-facing tier leads with a plumbing-voice outcome line and the 🛡 warranty, with the itemized parts
  collapsed under a "what's included" expander. Low effort, medium impact.

### 5. Picture-forward beats text — keep and extend it
- **Pattern:** Leaders attach photos to services/materials and show before/after and product images in the
  proposal; visual price books report ~15–25% ticket lift vs text-only.
- **Principle:** Processing fluency + tangibility — a photo of the corroded line makes the problem (and the
  fix) real and reduces "is this necessary?" doubt.
- **Public source:** [Housecall Pro — price book / visual proposals](https://www.housecallpro.com/features/price-book/).
- **CB move:** `/e/[token]` is already picture-forward (per-line `photo`/`gallery`). Extend it: let the tech
  attach **this job's** before-photo (the actual clog/corrosion) to the top of the close, captioned in our
  voice. Pair with the existing pricebook `media` route so each tier card can carry a representative image.
  Honesty: real photos only — this job's or a true representative, never stock that misleads. Medium effort.

### 6. Make membership the obvious savings, shown inline
- **Pattern:** Tiered membership (Bronze/Silver/Gold) displayed visually with the member price struck
  against list converts better than a separate upsell; the discount is shown *at the moment of choosing*.
- **Principle:** Reciprocity + anchoring on list price — the struck-through regular price anchors high and
  the membership feels like a gift that pays for itself on this very job.
- **Public source:** [Housecall Pro — recurring service plans / memberships](https://www.housecallpro.com/features/consumer-financing/) and price-book page above.
- **CB move:** We already do member pricing with strike-through in the tech cart (`Clog Club`). Surface the
  SAME "Regular $X → Member $Y, you save $Z" on the customer `/e/[token]` ladder, with a one-tap "add Clog
  Club" that re-prices all three tiers live. **No dark pattern: never pre-check membership; show the real
  recurring cost; owner approves the discount %.** Medium effort, high ticket impact.

### 7. Honest scarcity + commitment, CB-style (no fake countdowns)
- **Pattern:** Conversion playbooks use scarcity, commitment/consistency, and social proof — but the
  research is explicit that misused urgency breeds refunds, resentment, and churn.
- **Principle:** Cialdini, applied ethically — commitment (a small "yes" leads to the big one), social proof
  ("neighbors near you chose…"), and *genuine* scarcity ("the tech is here now; today's price is held").
- **Public source:** [CXL — Cialdini's principles for conversion](https://cxl.com/blog/cialdinis-principles-persuasion/); [Cognitigence — Cialdini's 7 principles](https://www.cognitigence.com/blog/cialdini-7-principles-of-persuasion). Key line, attributed: persuasion vs. manipulation is "the right moment."
- **CB move:** Our footer already says "Prices held for this visit. Nothing is charged until you approve." —
  that's honest scarcity; keep it. Add (a) a small "✓ approve now" commitment microstep we already have, and
  (b) optional, TRUE social proof ("most homes on your street pick Better") only when we can back it with
  real local data. **Hard rule (matches CB policy): NO fabricated countdown timers, NO fake "3 left," NO
  pre-checked upsells. Honest urgency only.** Low effort, guardrail-first.

### 8. Reduce the close to one obvious next tap
- **Pattern:** NN/g checkout research: small changes to CTA prominence/placement and form simplicity move
  conversion substantially; the cart is where the final decision happens, so it must be friction-free.
- **Principle:** Choice overload / fluency — one primary action, secondary actions visually demoted; every
  extra field or competing button costs conversions.
- **Public source:** [NN/g — e-commerce shopping-cart usability research](https://www.nngroup.com/reports/topic/e-commerce/).
- **CB move:** On `/e/[token]` keep ONE primary amber/green CTA per state ("✓ Approve & Schedule"), with
  Deposit / Ask / Not now clearly secondary (we mostly do this). When the ladder lands (#1), the per-tier
  "This one — $X" button becomes the single primary action per card; everything else demotes. Low effort,
  protect-don't-break.

---

## Priority ladder (impact × effort)

| # | Move | Impact | Effort | Why first |
|---|------|--------|--------|-----------|
| 1 | Ladder on the customer close screen | ★★★ | ●● | Engine exists; biggest leak (deep-dive agrees) |
| 3 | Honest hero-middle + real top-tier anchor | ★★★ | ● | ~80% built; pure framing win |
| 6 | Membership savings shown inline on close | ★★★ | ●● | Ticket + recurring revenue |
| 2 | Lead with honest $/mo financing | ★★ | ● | We already compute it; just surface honestly |
| 4 | Outcome-led tier copy + warranty first | ★★ | ● | Voice/data tweak |
| 5 | This-job before-photo on the close | ★★ | ●● | Tangibility; media route exists |
| 7 | Ethical scarcity/social-proof guardrails | ★ | ● | Mostly a do-no-harm rule |
| 8 | One obvious CTA per state | ★ | ● | Polish; don't regress |

---

## CB guardrails baked into every recommendation
- **Owner approves all prices.** Nothing here moves a price without owner sign-off (margin-watch SUGGESTS,
  owner approves — existing CB rule).
- **No dark patterns.** No fake timers/stock, no pre-checked upsells, no decoy that isn't a real option,
  no implied financing rate we don't actually have.
- **Selecting never charges.** The ladder records an accepted estimate handed to the office; payment is
  arranged separately — preserves `lib/pricebook.js` invariant (statuses never include `paid`).
- **Amber brand + plumbing voice** on every customer surface; hardcoded-dark close keeps hardcoded-light text.

---

### Sources
- ServiceTitan — [Presenting Options (Contractor Playbook)](https://www.servicetitan.com/guides/contractor-playbook/presenting-options), [Estimate templates 101](https://www.servicetitan.com/blog/webinar-recap-back2basics-estimate-templates-101)
- Housecall Pro — [Price book / visual proposals](https://www.housecallpro.com/features/price-book/), [Consumer financing & memberships](https://www.housecallpro.com/features/consumer-financing/)
- [Wisetack — home-services financing](https://www.wisetack.com/) · [SubcontractorHub — contractor financing](https://www.subcontractorhub.com/blog/contractor-financing-options)
- [PayPro Global — price anchoring](https://payproglobal.com/how-to/use-price-anchoring/) · [Orbix Studio — pricing-page psychology](https://www.orbix.studio/blogs/saas-pricing-page-psychology-convert)
- [NN/g — e-commerce usability research](https://www.nngroup.com/reports/topic/e-commerce/)
- [CXL — Cialdini for conversion](https://cxl.com/blog/cialdinis-principles-persuasion/) · [Cognitigence — Cialdini's 7 principles](https://www.cognitigence.com/blog/cialdini-7-principles-of-persuasion)
