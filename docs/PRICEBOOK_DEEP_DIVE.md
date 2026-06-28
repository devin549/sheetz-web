# Pricebook + Good/Better/Best — Deep-Dive Audit (DIAGNOSIS)

_Pricebook Conversion Architect · 2026-06-28 · diagnosis only, no close-screen rewrite yet._

This is the company's revenue artery. The estimate is what the customer literally watches on the iPad
at the kitchen table. Below: how it works today, what's good, where it leaks money against buying
psychology, a prioritized hit-list, and the pricing questions only Devin can answer.

---

## 1. Current-state map — how it actually works today

There are **THREE separate "estimate" surfaces** in the codebase, and they do not share a tier engine.
This fragmentation is the single biggest structural finding.

### A. `/estimate` — the standalone "Good/Better/Best" builder
- `app/(main)/estimate/EstimateBuilder.js` + `actions.js` + `lib/pricebook.js` (`buildProposal`/`selectTier`).
- Tech hand-types 3 tiers from a **hardcoded `SEED`** (drain unclog: $145 / $385 / $685). Items, prices,
  pitch, warranty all free-text. No connection to the 549-item pricebook.
- Has the best *psychology engine* in the repo: middle tier defaults to `recommended`, `upgradeTo`
  "+$X step up" deltas are computed, `~$X/mo` (÷24) shown, "★ MOST POPULAR" badge, recommended tier
  gets amber border + green badge + amber CTA.
- "Choose" records a `proposals` row and never charges. **Live data: `proposals` table = 0 rows ever.**
  This builder is effectively unused in the field.

### B. `/job/[id]/pricebook` — the per-job pricebook (the one techs actually use)
- `PricebookClient.js` + `page.js` + `lib/pricebookEngine.js` (`buildTiers`) + `estimateActions.js`.
- This is the real workhorse: search 549 items, Suggested-for-this-job ranking, tech/customer mode
  toggle, margin health (tech-only), member-pricing toggle (Clog Club −15%), cart → "Present / send"
  (creates a token link) or "record sold now."
- Good/Better/Best ladder appears **only if a `pricebook_bundles` row matches the job type.** It's
  built by `buildTiers()` using each bundle-item's `tiers: []` array.
- The cart itself (the thing techs use 99% of the time) is a **flat single-price list**, not tiered.

### C. `/e/[token]` — the PUBLIC customer close (the texted link / turned-around iPad)
- `app/e/[token]/CustomerEstimate.js` + `page.js`. **This is the screen the customer's thumb taps.**
- It is **NOT Good/Better/Best.** It renders the cart's lines as a flat, picture-forward list with a
  single **Total**, then Approve / Deposit / Ask / Not now. Whatever tier the tech picked collapses into
  one option before it reaches the customer. The customer never sees a ladder, never sees "+$X to step up."
- Hardcoded-dark page (`#0e0f12` bg, hardcoded light text) — correctly immune to the light-mode washout
  bug, but also brand-inconsistent with the cream field theme.
- There's a 4th, vestigial `/job/[id]/estimate/page.js` that's just a pill list pointing back to `/estimate`.

### Two conflicting tier definitions (latent bug)
`buildTiers()` (pricebookEngine, used by the live page) keys tiers off the **`bundle_items.tiers[]`** array.
`bundleDetail()` (pricebookQuery, used by `/api/pricebook/*` + catalog) keys the SAME tiers off
**`required_or_optional`** (required→Good, +optional→Better, +upsell→Best). Same bundle, two different
ladders depending on which code path renders it. In the one seeded bundle the data happens to satisfy
both, but they will diverge the moment someone edits a bundle.

### What's real vs seeded (live service-role read, 2026-06-28)
- **549 active items**, all `customer_visible`, all priced. Price range $1 → $6,800, **median $309.**
- **Only 40 / 549 items have a material cost** → margin math (`marginPct`, margin-watch, below-minimum,
  `priceForTargetMargin`) is **blind on 93% of the catalog.** Every item has `target_margin_pct` set,
  but with no cost the target is unenforceable.
- 258/549 have a photo; 329/549 have warranty text; all have customer_name + description.
- **254 categories** in the table; the curated `pricebookTaxonomy.js` collapses them to ~16 for browsing.
- **Good/Better/Best is essentially unseeded:** 4 bundles exist, but **only 1** (`drain-unclog-starter`)
  has tier names + best-for copy filled in. The other 3 (sewer backup, water heater install, toilet
  repair) have `NULL` tier names → `buildTiers` returns `[]` → **no ladder shows on those job types.**
  Total `pricebook_bundle_items` across ALL bundles = **3 rows** (all in the one drain bundle).
- **2 estimate links ever sent** (one viewed-$1025-best, one declined-$876-better); **0 proposals.**
  The whole GBB apparatus has barely been exercised in production.

---

## 2. What's working

- **The psychology vocabulary already exists in code** — `recommended`, `upgradeTo` deltas, monthly
  framing, "MOST POPULAR" badge, middle-tier default. The bones of a strong close are present in
  `lib/pricebook.js` / `EstimateBuilder.js`. The problem is they live on the *unused* surface.
- **Two-view margin gating is clean and correct.** `customerView` / `internalExtras` / `shapeItem` never
  leak cost/margin/minimum to the customer; the `/e/` snapshot strips `itemId`. The guardrail holds.
- **Owner-only price movement is enforced** — margin-watch and `flagPartCostGaps` only file PENDING
  `price_update_requests`; nothing auto-changes a price. Matches the house rule exactly.
- **Proof/consent capture is genuinely good** — typed-name + checkbox authorization, phone/verbal
  approval logging with a witness, event timeline, audit_log, Discord ping. Strong trust + anti-dispute.
- **Objection scripts** (`OBJECTION_SCRIPTS`) and the in-cart "If they hesitate" chips are smart, ethical
  reframes (financing, hold price, warranty) — good reciprocity/loss-aversion language already written.
- **Member pricing with strikethrough "Regular price → saves −$X"** is exactly the right savings anchor.
- **Suggested-for-this-job ranking** and the 45-pills→1-dropdown cleanup correctly fight choice overload.
- **Card-fee transparency** ("Customer pays" includes the 4% online fee) is honest framing.

---

## 3. Gaps by principle

### Tier engineering — the middle is NOT the target (CRITICAL)
- The customer never sees three tiers. `/e/[token]` flattens to one Total. **The compromise effect
  (most people pick the middle) cannot operate when there's only one option on the customer's screen.**
  This is the highest-leverage miss in the whole system: GBB is the named feature and the customer
  literally never experiences it.
- Good is not engineered as a deliberate bare floor, and Best is not tuned as a decoy/anchor — because
  for 3 of 4 job types there are no tiers at all, and the one that exists was seeded once and never priced
  for asymmetric dominance (good $491 / better ~$700 / best ~$876–$1025; the Better→Best gap is the
  membership at $149, which is a *value* step, not an anchor — fine, but unverified as intentional).
- The standalone builder's `SEED` ($145/$385/$685) IS engineered (middle recommended, clean deltas) but
  it's hardcoded fiction disconnected from the real catalog, and nobody uses it (0 proposals).

### Anchoring — high number is not shown first
- `/e/` shows a single number; no anchor at all. The builder lists Good→Better→Best top-to-bottom, so the
  **lowest** number is read first — the opposite of anchoring. Lead the eye with Best (highest) so Better
  reads as the reasonable middle.

### Recommended-tier visual dominance — present in builder, absent at the close
- Builder: recommended tier gets 2px amber border + tint + badge + colored CTA. Good.
- `/e/` customer close: **no recommended hero, no badge, no size/raise difference** — every line card is
  identical weight. The customer's eye has nothing to land on. The close has zero visual hierarchy.

### CTA contrast — and the light-mode washout bug (HOUSE-RULE VIOLATION)
- `EstimateBuilder` recommended CTA: `background: var(--accent)` + hardcoded `color: '#1a1206'`. In
  **light mode `--accent` = `#7a5800` (dark brown)** → dark text on dark-brown button = low-contrast,
  washed-out CTA outdoors. Violates "a hardcoded-dark element needs hardcoded-light text" (and here the
  background itself flips dark in light mode while the text stays dark).
- `PricebookClient` tier badge + "Choose" use `var(--amber)` which flips to `#7a5800` in light mode with
  hardcoded `#1a1a1a` dark text — same washout risk on the tile the customer sees in Customer view.
- The green "Choose/Approve" should be the single highest-contrast element on each tier; on `/e/` Approve
  is green (good), but it sits below Deposit/Ask/Not-now with similar visual weight — the primary action
  isn't dominant enough.

### Loss-framing before price — missing
- Nowhere does the customer screen lead with the **cost of NOT fixing** (re-clog, water damage, code,
  callback) before showing the number. `est.customerDescription` is neutral ("we'll get your drain
  flowing"). Pain-first framing is the cheapest acceptance lift available and it's absent.

### Choice overload — good on browse, but the close lacks a default
- The dropdown + suggested ranking handle browse-side overload well. But on `/e/` a multi-line flat cart
  with no recommended default reintroduces "which of these do I pick / is this all required?" ambiguity.

### Color / eye-path
- Builder uses green for badge + monthly + CTA correctly. `/e/` uses amber for price and green only for
  the approve button — the eye-path to "yes" is weak; price (amber) competes with the CTA for attention.

### Daylight readability + washed-out dark text
- `/e/` is hardcoded dark with hardcoded light text → **safe and readable** in daylight (ironically the
  best-behaved screen on this axis). The in-app builder + PricebookClient tiers carry the washout risk
  described above. Font sizes on `/e/` are generous (16–26px) — good for the kitchen table.

### Trust cues
- Strong on `/e/`: brand header, tech name signature, "Prices held for this visit. Nothing charged until
  you approve," 🛡 warranty, product PDFs, photos. **Missing:** licensed/insured badge, the tech's
  *photo* (only name), star rating / review count, and the consent line as a *benefit* up front.

### Bundling & whole-job framing — built but unseeded
- The bundle apparatus (fix + camera + BioOne + membership as one tier) is exactly right, but only 1 job
  type is bundled. Techs on the other ~15 job types build flat carts with no whole-job "one yes" framing.

### Payment / financing framing — inconsistent
- Monthly equivalent (`~$X/mo`) exists **only** in the unused builder, and is a naive ÷24 with no real
  financing product. The screen the customer sees (`/e/`) shows only the lump Total — the #1 lever for
  big-ticket acceptance (water heater $2–6k) is absent at the point of decision. "Financing available"
  is only a passive chip in the tech cart, never surfaced to the customer.

### Social proof / honest urgency — absent (and must stay honest)
- No "most homes on your street chose Better," no review count, no honest "today's truck stock / before
  the weekend" urgency. These are powerful but must be **literally true** — flagged as owner decisions,
  not to be fabricated.

---

## 4. Prioritized hit-list

Format: **change · principle · expected lift · effort · risk**

1. **Bring Good/Better/Best to the customer close (`/e/[token]`).** Render the 3 tiers as cards with the
   recommended tier as a raised, badged hero; collapse to flat only when no bundle exists. · _compromise
   effect + visual dominance + anchoring_ · **Highest lift on average ticket** (the named feature finally
   reaches the buyer). · **L** · Med — needs the estimate snapshot to carry tiers, not one cart.

2. **Lead each tier (and the close) with loss-framing before the price.** One line: "A re-clog or
   backup can mean $X in water damage + another trip." · _loss aversion_ · High lift on acceptance,
   cheap. · **S** · Low — copy only, must stay truthful.

3. **Fix the light-mode washout on the recommended CTAs.** Hardcode light text on hardcoded/`--accent`/
   `--amber` backgrounds (or use a token that stays bright in light mode) in `EstimateBuilder` +
   `PricebookClient`. · _daylight readability house rule_ · Prevents lost reads outdoors. · **S** · Low.

4. **Seed the other high-volume bundles** (water heater install, sewer backup, toilet repair) with real
   tier names, best-for copy, and items — they currently show NO ladder. · _bundling / whole-job_ · High
   lift (unlocks GBB on the biggest tickets). · **M** · Low (data), but pricing = owner decision (§5).

5. **Surface monthly/financing on the premium tiers at the close.** Real "as low as $X/mo" on Better/Best
   on `/e/`, gated to a real financing product. · _payment framing_ · High lift on big tickets. · **M** ·
   Med — needs a real financing partner + true APR/term, not ÷24.

6. **Reconcile the two tier engines** (`buildTiers` via `tiers[]` vs `bundleDetail` via
   `required_or_optional`) into one source of truth. · _correctness_ · Prevents divergent ladders /
   mispriced tiers. · **M** · Med — touches catalog API + job page.

7. **Make the recommended tier the single highest-contrast thing; demote secondary CTAs.** Green
   "Choose/Approve" dominant; Deposit/Ask/Not-now visually quieter on `/e/`. · _CTA contrast / eye-path_ ·
   Med lift. · **S** · Low.

8. **Backfill material cost on the catalog (currently 40/549).** Margin-watch, below-minimum, and
   target-margin enforcement are blind without it. · _margin integrity (protects ticket profit, not just
   acceptance)_ · High operational value. · **L** · Low risk, high effort — likely a vendor-cost import.

9. **Add trust cues to the close:** tech photo, licensed/insured, review count (if true). · _trust /
   reciprocity_ · Med lift. · **S** · Low — only if the social proof is real.

10. **Retire or merge the orphan surfaces** (`/estimate` builder with 0 proposals; vestigial
    `/job/[id]/estimate`). Decide: promote the builder's psychology into the real flow, or delete it. ·
    _focus / maintainability_ · Indirect. · **S–M** · Low.

---

## 5. Pricing-presentation questions for the owner (you move prices, not me)

1. **What is the target ticket per job type?** GBB only works if Better is engineered to land on it.
   Right now only the drain bundle has tiers and they were seeded once — are $491 / ~$700 / ~$876 the
   intended Good/Better/Best for a drain unclog, or placeholder?
2. **Is Good meant to be a deliberate bare floor?** (slightly unattractive on purpose so Better wins) —
   or a genuine budget option? This changes how aggressively we de-emphasize it.
3. **Is Best a real anchor/decoy?** Should there be a high "kitchen-sink" Best on big jobs (water heater
   + expansion tank + haul-away + 10yr warranty) specifically to make Better look smart?
4. **Charm vs premium pricing per tier?** Want Good at $-95/$-99 ("deal") and Best at round numbers
   ($1,200) ("quality")? Today prices are arbitrary ($491, $876).
5. **Real financing product?** Is there a partner (Wisetack/Synchrony/etc.) so we can show true "as low
   as $X/mo," or should we drop the monthly framing until one exists? (Current ÷24 is fictional.)
6. **Member pricing as a tier lever?** Clog Club is −15%. Should "join + save" be baked into the Best
   tier framing on every job (membership pays for itself this visit)?
7. **Honest social proof we can use?** Real review count / "X homes on your street" data, or a true
   "before the weekend / today's truck stock" urgency we're allowed to state?
8. **Below-minimum + target margins** are set on 549 items but cost exists on 40 — do you want a
   cost-backfill so margin-watch can actually protect the floor?

---

_Probe script used: `scripts/_probe_pricebook.cjs` (read-only; safe to delete)._
