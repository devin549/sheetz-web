# Pricebook — "Selling Machine" Build Doc

_The arteries of the company. Every change is a money decision. 2026-06-28._

This is the master spec from the full pricebook planning pass. It captures what exists, what we
build, the order, the schema changes, the house rules, and the pricing decisions only Devin can make.

**Legend:** ✅ already built · 🧩 small add (schema/wiring) · 🔨 net-new build · 💰 needs owner pricing

---

## House rules (cross-cutting — apply to everything below)
- **Owner is the ONLY price-mover.** Every AI/margin/market feature **suggests → owner approves**. Nothing auto-changes a price, ever.
- **Tax = opt-in, default OFF.** Computed server-side, applied only to lines flagged `taxable`. Global default stays no-tax.
- **Honest only.** No fabricated social proof or fake urgency. Use **CB's own** warranty/legal text — never copy ServiceTitan.
- **Daylight-safe + CB amber.** Hardcoded-dark elements need hardcoded-light text. Light-mode washout is a bug.
- **Role split:** Owner = everything incl. live price. GM/OM = everything; price changes queue for owner approve. **Marketing = merchandising layer only** (copy, photos, links, tags) — price field locked.

---

## What already exists (the leverage — we're extending, not starting over)
- ✅ GBB ladder on the customer close (`/e/[token]`) — recommended hero, anchoring, loss-framing line, washout-safe.
- ✅ GBB **bundle builder** in `/pricebook-admin` (build live ladders for any job type; verified $491/$876/$1025 on drain).
- ✅ `pricebook_media` table — photo/gallery/pdf/video/manufacturer_link, per-media `customer_visible` + `sort_order`; the close consumes it.
- ✅ Real deep **category tree** imported (`pricebook_categories`, 254 rows, 247 nested via `parent_id`).
- ✅ **Auto category art** generator (`scripts/gen_category_art.cjs`, AI tiles → `catalog-art` bucket).
- ✅ **SerpAPI photo finder** — `findItemPhotos` (candidates), `setItemPhotoUrl` (pick → re-host), `uploadItemPhoto` (upload own). Key set.
- ✅ **Learning engine** — `learnPartsFromJobs` (service↔part co-occurrence + `times_seen`), `relatedItems`/job-suggestions (cross-sell), `pricebook_ai_observations` queue, margin-watch suggest→approve.
- ✅ Two-view customer/internal copy, member pricing (−15%), 4% card-fee math, typed-name + checkbox **consent capture** at approval, `pricebook_estimate_events` (viewed/approved/declined).
- ✅ Item create (`addPricebookItem`) + price edit (`updateItemPrice`); item search engine.

---

## Phase 0 — schema (one migration)
🧩 Add the columns the build needs (schema 104 already has most):
- `pricebook_categories`: `image_url text`, `icon text`.
- `pricebook_items`: `legal_text text` (per-line disclaimer), `add_on_price numeric`, `member_add_on_price numeric`, `member_price numeric` (if not present), `allow_discount_codes bool default true`, `allow_membership_discount bool default true`, `is_labor_service bool default false`, `cross_sale_group text`, `gl_account text`, `expense_account text`, `business_unit text`, `conversion_tags text[]`, `project_label text`. Confirm `taxable` default **false**.
- Settings: `tax_rate` (default 0 / off), `material_pct_threshold` (default 20).

---

## Phase 1 — FOUNDATION (the editor + structure) 🔨
Unblocks everything: seeding ladders, fixing photos, capturing cost. Build on its own branch.

### 1a. Full item editor (ServiceTitan field-parity)
- **Code** (`sku`, 31-char cap, unique), **Name**, **Item Description**, **Warranty Description**, **Legal/disclaimer text**.
- Toggles: **Taxable** (default off), **Allow Discount Codes**, **Allow Membership Discounts**, **Labor Service**.
- **Pricing — Static by default** (owner-set): Static Price, Member Price, **Add-on Price**, **Member Add-on Price**. **Dynamic Price = OFF** unless explicitly enabled (the time/zone modifier — see Deferred).
- **Hours** + **Estimated Labor Cost**; **Estimated Material Cost** (fed by Phase 2).
- **Cross-Sale Group** + **Recommended Upgrades** picker (Phase 2 learned co-sells pre-fill).
- **Category** (cascading picker on the real tree), **Conversion Tags**, **Project Label**, **GL/Expense/Business Unit**, **Equipment/Template items**.
- **Role-aware:** marketing sees price **locked** ("owner approves"); price edits route to the owner-approve gate. Live "what the customer sees" preview.

### 1b. Category tree management
- Add **main** category (no parent) + **subcategory** under any node (arbitrary depth), rename, **reorder** (`sort_order`), move to a new parent, **archive**.
- **Safe-delete** (no orphans — reassign or archive). Structural edits = owner/GM/OM.
- **Category images:** AI auto-art (existing generator) **or** SerpAPI find **or** upload; **inheritance** (sub with no art inherits parent / auto-generates); store on the category (`image_url`).

### 1c. Media manager (per item)
- Primary photo + **gallery**, **PDF**, **manufacturer/web link**, **video**; each with **customer-visible toggle** + drag-reorder.
- **Photo finder:** **3-max** candidates, **engine picker** (Google Shopping / Images / **Yandex** / Lens), **"more like this"** reverse-image on the selected one, or **upload your own**. Re-hosted so links never rot.

### 1d. Image pipeline 🔨
- On upload, `sharp` → resize by type (**500×500** items / **600×400** category banners) → **WebP @ q80** → enforce **<100KB** → store. Overlays as display-layer badges, not baked in.

### 1e. Live mobile preview 🔨
- A **"Mobile view"** toggle in the editor renders a phone frame with a **Tech card ⇄ Customer close** switch.
- Renders the **real components off live data** (`CustomerEstimate` / tier cards) → updates **instantly** as you edit (no save). Beats ST, whose builder "doesn't reflect in preview."
- **"Open on my phone"** (QR / send-link) to view the actual `/e/[token]` render on a real device.

---

## Phase 2 — INTELLIGENCE (margin + learning) 🔨
- **Parts → material cost:** roll up `learnPartsFromJobs` × vendor prices → **suggested `estimated_material_cost`** (owner confirms). Closes the "margin blind on 93%" gap.
- **Material-over-20% guardrail:** margin-watch extension — material ÷ price > threshold (default 20%) → flag + **suggest** raising labor/price. Owner approves.
- **Profit intelligence:** unique **Code** tracking; **avg time-to-complete** (job status timeline × `job_pricebook_usage`) → **effective $/hr**; **flag low-profit** jobs/items.
- **AI description coach:** vague tech entry ("rebuild toilet") → flag + **clarifying questions** ("which toilet? scope?") + **one-tap polished rewrite** (warranty-aligned). Feeds the learning queue. Never touches price.
- **Always-learning → Master Task:** custom entry → AI clean → `pricebook_ai_observations` → **frequency detector** ("created 5× this month") → **promote** to a real item (owner prices).
- **Suggested wording:** AI reads internal text → customer-benefit copy suggestion (approve/edit).
- **Market reference:** live **material** (SerpAPI) + **BLS labor wage** × hours + **AI range** (labeled "estimate, verify") — shown **beside** the owner-set price, never as the price.

---

## Phase 3 — THE CLOSE AT FULL POWER (the money levers) 🔨💰
- 💰 **Seed GBB ladders** across the top job types (water heater, sewer, toilet, etc.) in the builder — needs owner pricing (see Decisions).
- **Loss-contrast:** red ❌ "what this option does NOT cover" per tier + **bright warranty badges** (30/60/90-day). The "erase the red X" effect.
- **"Join the plan, save $X on this job"** auto-membership banner + **member price** shown at the close.
- **Financing:** **Wisetack + Synchrony** — "or $X/mo" + **apply-in-60s** link; route by ticket size (Wisetack POS / Synchrony bigger jobs).
- **Honest social proof:** review count/stars, licensed/insured, **tech photo**, and the tech's **real before/after job photos** in the estimate.
- **Approve → pay now:** wire the closeout checkout (reader / link / key-in / ACH) onto approval — capture the money at "yes."
- **Per-line warranty + legal**, agreed at approval (rides existing consent capture). Devin supplies the legal text.

---

## Phase 4 — LEARN WHAT CLOSES 🔨
- **Conversion analytics** on `pricebook_estimate_events` — which tier / copy / photo actually gets the yes (view→approve rate, tier mix, average ticket) → feed it back into the builder + coaching.

---

## Pricing decisions only Devin can make 💰
1. Target ticket per job type (what should **Better** land on for water heater / sewer / toilet?).
2. Is **Good** a deliberate bare floor or a real budget option?
3. Is **Best** a true anchor (kitchen-sink option) to make Better look smart?
4. Charm vs round pricing per tier (Good …95/…99, Best round)?
5. Financing terms (Wisetack/Synchrony) — confirmed partners; need the APR/term to show real "$X/mo".
6. Member pricing as a Best-tier lever (bake "join + save" into framing)?
7. Honest social proof we're allowed to state (real review counts / true urgency)?
8. Tax rate (KY) — set the rate; it stays off until toggled per job.
9. Material % threshold (default 20%) — confirm.
10. Legal/warranty disclaimer text (Devin's own — to wire per line).

---

## Suggested build order
**Phase 0 → 1** (foundation: editor + tree + media + image pipeline + photo finder) — unblocks seeding/photos/cost.
**Phase 2** (intelligence) — turns it self-improving + margin-safe.
**Phase 3** (close at full power) — the money. Seed ladders + financing + loss-contrast + pay-now.
**Phase 4** (analytics) — make it keep getting better.

Each phase = its own branch, review-first, never auto-deploys.
