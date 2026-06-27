# GOLD — "Me" Panes Deep-Extract

Source of truth: `mockups/tech_ipad_v3.html` (the gold tech-iPad SPA, ~13,300 lines).
This document captures, **verbatim**, the markup, JS, backend contracts, and data
fields for 8 panes so they can be ported to Next.js + Supabase **faithfully**
(same layout, same colors, same functions).

> **Porting rule (read first):** these 8 panes are almost entirely **static
> markup** in the gold file (hardcoded demo data — "Matt Shepard", "$1,847.50",
> etc.). There are **no per-pane `renderX()` functions** and **no
> `google.script.run` calls inside the pane markup itself** — the backend
> contracts that feed these screens live in *other* flows (job close-out,
> payroll accrue, fleet, EWA submit, dispute submit). When you port, replace the
> hardcoded values with Supabase query results but keep the **exact DOM
> structure + inline styles + color tokens** below.

---

## 0. Shared color tokens (`:root`) — replicate EXACTLY

Defined `tech_ipad_v3.html:8-39`. Dark is the default; `body.light-theme`
overrides. Every pane below references these `var(--token)` names — port them as
CSS variables, do **not** inline raw hex where a token is used.

### Dark (default) — lines 10-20
```css
--bg:#0e1116; --surface-0:#11151c; --surface-1:#161a22;
--surface-2:#1d222c; --surface-3:#262c38;
--fg:#ecedef; --fg-2:#b6bac3; --fg-3:#767c8a; --fg-1:#ecedef;
--border:#232834; --border-strong:#2e3543;
--amber:#FFB300; --amber-dim:#D4A55A; --amber-deep:#3A1A0A; --amber-bright:#FFD54F;
--green:#1B5E20; --green-bright:#4caf50;
--yellow:#a08000; --yellow-bright:#ffc107;
--red:#a00; --red-bright:#ff5560;
--blue:#4f9bff; --purple:#9c64f4;
```

### Light (`body.light-theme`) — lines 26-38
```css
--bg:#fbf6ea; --surface-0:#ffffff; --surface-1:#f7f1e3;
--surface-2:#efe7d4; --surface-3:#e3d9c2;
--fg:#111418; --fg-2:#33383f; --fg-3:#565b64; --fg-1:#111418;
--border:#c4c9d2; --border-strong:#a6acb8;
--amber:#B8860B; --amber-dim:#6b5208; --amber-deep:#FFE0A0; --amber-bright:#FFB300;
--green:#2E7D32; --green-bright:#1B5E20;
--yellow:#c79100; --yellow-bright:#f57c00;
--red:#c62828; --red-bright:#b71c1c;
--blue:#1976d2; --purple:#6a1b9a;
```

### ⚠️ Hardcoded hex used as TEXT on dark elements (flagged per spec)
These do NOT come from a token and will go near-black / unreadable if you blindly
flip them in light mode. The gold file patches several via `body.light-theme
[style*=...]` overrides (lines ~132-197). Port the override map too, or pin the
colors:
- `#4caf50` (green) — used everywhere as success text/fill instead of `var(--green-bright)`.
- `#ff8a65 / #ff8a80 / #ff5252 / #d32f2f / #ffd54f` — Turd/red + Turd-gold roast text.
- `#a5d6a7` (pale green), `#80deea` (fuel cyan), `#64b5f6 / #4fc3f7` (blue), `#9c64f4 / #c8a8ff / #e1bee7 / #ba68c8 / #b388ff` (purple/Hank), `#26c6da` (fuel), `#cd7f32` (bronze), `#b0bec5` (silver), `#cdd3dd` (estimate banner sub).
- Pay pane "Earned today" `#4caf50`, eod hero `#4caf50` greens.
- Races leaderboard rank colors `#ffd700 #c0c0c0 #cd7f32` (`.lb-row.gold/.silver/.bronze .lb-rank`, lines 792-794), patched in light mode at lines 132-134.

### Nav entry points (`tech_ipad_v3.html:1697-1702`, 1628)
```html
<div class="nav-icon" id="nav-eod"     onclick="navTo('eod')">🌙 End</div>
<div onclick="navTo('vegas')">…</div>   <!-- "Vegas" card lives in the Wins group, line 1628 -->
<div class="nav-icon" id="nav-races"   data-tech-only="1" onclick="navTo('races')">🏁 Races <span class="badge" style="background:#d32f2f;">5</span></div>
<div class="nav-icon" id="nav-record"  data-tech-only="1" onclick="navTo('record')">🏆 Record</div>
<div class="nav-icon" id="nav-board"   data-tech-only="1" onclick="navTo('board')">🎰 Vegas</div>  <!-- NOTE label mismatch, see Vegas/Board pane -->
<div class="nav-icon" id="nav-pto"     onclick="navTo('pto')">📅 PTO</div>
<div class="nav-icon" id="nav-reviews" onclick="navTo('reviews')">⭐ Reviews</div>
```
> **GOTCHA:** the nav button `id="nav-board"` is labeled "🎰 Vegas" but routes to
> `navTo('board')` (the Leaderboard pane). The achievements/slots pane is
> `pane-vegas`, reached via the header Wins card (`navTo('vegas')`, line 1628)
> and from the close-celebration "Go Vegas" button. Preserve this routing or fix
> it deliberately.

`navTo` is allow-listed for these views at `tech_ipad_v3.html:8641-8642`:
```js
var commerceViews = ['estimate','invoice','receipt','finance','videos','formfill','po','comms','customer','sod','eod',
  'tools','van','shop','shopco','pay','races','record','board','vegas','pto','mkt','reviews','settings','cal','estimates', …];
```

### Shared CSS classes used by these panes (`tech_ipad_v3.html:712-821`)
`.pay-hero`, `.pay-grid`, `.pay-card` (+`.v`,`.delta`,`.delta.neg`),
`.pay-breakdown`, `.pay-line` (+`.bonus`,`.deduct`,`.total`),
`.pay-jobs-table`, `.pay-table-row` (+`.header`,`.cust`,`.amt`,`.amt.green`),
`.send-payroll-btn` (+`:disabled`,`.sub`), `.info-card` (+`.row`,`.lbl`,`.v`),
`.lb-row` (+`.me`,`.gold/.silver/.bronze`), `.lb-rank/.lb-name/.lb-stat`,
`.achv-grid`, `.achv` (+`.earned`, `.ico/.lbl/.desc`),
`.review-card` (+`.stars/.who/.date/.body`). Verbatim:
```css
.pay-hero { /* 712 */ background:linear-gradient(135deg,var(--amber-deep) 0%, var(--surface-1) 100%); border:1px solid var(--amber); border-radius:12px; padding:16px 18px; margin-bottom:14px; }
.pay-hero .week { color:var(--amber-dim); font-size:11px; text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
.pay-hero .total { font-family:'JetBrains Mono',monospace; font-size:36px; font-weight:800; color:var(--amber); margin:4px 0; }
.pay-lock-bar { flex:1; height:8px; background:var(--surface-3); border-radius:4px; overflow:hidden; }
.pay-lock-fill { height:100%; background:linear-gradient(90deg,var(--green-bright) 0%, var(--amber) 100%); width:67%; border-radius:4px; }
.pay-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
.pay-card { /* 723 */ background:var(--surface-1); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
.pay-card .v { font-family:'JetBrains Mono',monospace; font-size:20px; font-weight:800; color:var(--fg); }
.pay-card .delta { font-size:11px; color:var(--green-bright); font-weight:700; }
.pay-line.bonus .amt { color:var(--green-bright); } .pay-line.deduct .amt { color:var(--red-bright); }
.pay-line.total { border-top:2px solid var(--amber); } .pay-line.total .amt { color:var(--amber); font-size:18px; }
.lb-row { /* 785 */ display:flex; align-items:center; gap:12px; background:var(--surface-1); border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:8px; }
.lb-row.me { border-color:var(--amber); background:rgba(255,179,0,.05); }
.lb-row.gold .lb-rank { color:#ffd700; } .lb-row.silver .lb-rank { color:#c0c0c0; } .lb-row.bronze .lb-rank { color:#cd7f32; }
.lb-stat { font-family:'JetBrains Mono',monospace; font-weight:700; color:var(--green-bright); }
.achv.earned { background:linear-gradient(135deg,var(--amber-deep) 0%, var(--surface-1) 100%); border-color:var(--amber); }
.achv .ico { font-size:32px; opacity:.4; } .achv.earned .ico { opacity:1; }
.review-card .stars { color:var(--amber); font-size:16px; } .review-card .body { font-style:italic; color:var(--fg-2); }
```

### Races/Stack keyframes (`tech_ipad_v3.html:12805-12889`) — REQUIRED for the Races pane FX
`pulse` (292 & 12805), `flicker` (12809), `plungerBob` (12838), `plungerGlow`
(12842), `checkpointPulse` (12846), `turdShake` (12850), `sparkle` (12855),
`barShine` (12859)/`.stack-fill-shine` (12882), `meetingGlow` (12870),
`bigNumberGlow` (12876), `cbSheetUp` (297, celebration sheet). Copy these blocks
verbatim — the Stack bar references them by name in inline `animation:` styles.

---

## 1. PANE: `pay` — "💵 My Pay" (`tech_ipad_v3.html:4202-4558`)

### 1a. Markup structure (top → bottom)
1. **`<h1>` + `.sub`** (4203-4204): "💵 My Pay · Week of May 25-31" / "Live from Tech Sheet · syncs from My Jobs col P every job complete".
2. **`.pay-hero`** (4206-4227): `.week`=CURRENT WEEK, `.total`=$1,847.50, sub "Gross before deductions · 14 jobs · 38 hr logged". `.lock-row` → `.pay-lock-bar/.pay-lock-fill` + label "4/6 🔒 lock checkpoints complete". Then **EWA block** (4214-4226): dashed top border `var(--amber-dim)`; "💰 Earned & Available NOW" `var(--amber-dim)`, **$252.00** in `var(--green-bright)` mono, "30% of net earned · max 2/wk · standard ACH $0 · instant $2.50", **`<button onclick="openEWA()">💵 Request Advance</button>** (green gradient `#4caf50→#1b5e20`).
3. **`.pay-grid`** (4229-4234): 4 `.pay-card`s — Last Week $2,103.40 (+$255.90 vs avg); YTD (22 weeks) $41,250 (+8% vs last year); Pay Type **Commission**; Rank This Week **#2** (↑ 3, `var(--blue)`).
4. **Weekly Fuel · Van #14** (4237-4253): gradient `#1a3a3a→surface-1`, border `#26c6da`, "✓ ON TRACK" badge. 4-col grid: 23.4 Gal / $84.62 Spent / 338 Miles / 14.4 MPG (`#4caf50`). Anomaly note box border-left `#26c6da`, heading text `#80deea`.
5. **Per-job margin · this week** (4257-4277): gradient `#1a3a2a→surface-1`, border `#4caf50`. Rows GREEN (`#4caf50` badges) and RED (`#ff8a65 / #ff5252 / #d32f2f` badges, "⬆ +$X to GREEN"). Footnote `#a5d6a7` on `rgba(76,175,80,.06)`.
6. **Corn + Turd · Pay Coach** (4282-4342): 2px `var(--amber)` border, gradient `#2a1a0a→surface-1`. "Roast: R" badge. Corn Crown block (`rgba(76,175,80,.08)` left `#4caf50`); Golden Turd block (`rgba(255,82,82,.08)` left `#ff5252`, heading `#ff8a80`); Nudge (`rgba(255,179,0,.08)` left `var(--amber)`); Comparison grid (4 metrics, `#4caf50` good / `#ff8a80` bad). Footnote: "Hank reads your My Jobs data every Saturday at noon".
7. **Earnings Breakdown** `.pay-breakdown` (4356-4397): comment block 4344-4355 contains the **verbatim pay formula** (see 1c). `.pay-line` rows: Revenue $5,840 / −dispatch $125 / −2× material $1,200 / −1.5× material $675 / **Commission subtotal $3,840** (amber) / +Commission $844.80 (`.bonus`) / +Material premium $153.75 / Vacation $0 / +Crown $150 / +FB $225 / +HHWP $30 / +Happy Poop $50 / −Doc Fraud $25 (`.deduct`) / −Callback $72.50 / −Helper share $210 / **NET PAY $1,146.05** (`.total`). Tap-to-expand hint box (`rgba(33,150,243,.06)` left `#64b5f6`).
8. **Material % flag meter** `data-tech-only="1"` (4406-4426): "supervisor alert at 40%" + "✓ CLEAR". Bar 32.1% fill (`#2e7d32→#66bb6a`), 40% red marker `#ff5252`.
9. **Jobs This Week (14)** `.pay-jobs-table` (4435-4546): header row + 6 demo rows + "+ 7 earlier" footer. Each row `onclick="toggleJobMath('NNNN')"` toggles a `#jobMath_NNNN` drawer (6-step math, color-coded by margin). Job ids: 1219, 1220, 1224, 1227, 1230, 1234.
10. **Lock Status box** (4548-4552) + disabled **`.send-payroll-btn`** (4554-4557): "📤 Send Payroll to OM (locks Saturday 11:59pm)".

### 1b. JS handlers (verbatim)
`toggleJobMath` (`tech_ipad_v3.html:11987-11991`):
```js
function toggleJobMath(jobId) {
  var el = document.getElementById('jobMath_' + jobId);
  if (!el) return;
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}
```
Animated $$$ counter on Pay open (wraps `navTo`, `tech_ipad_v3.html:12081-12098`):
```js
var payAnimated = false;
var origNavTo = navTo;
navTo = function (name) {
  origNavTo(name);
  if (name === 'pay' && !payAnimated) {
    payAnimated = true;
    var totalEl = document.querySelector('#pane-pay .pay-hero .total');
    if (totalEl) {
      var target = 1847.50, current = 0;
      var step = target / 30;
      var ti = setInterval(function () {
        current += step;
        if (current >= target) { current = target; clearInterval(ti); }
        totalEl.textContent = '$' + current.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }, 30);
    }
  }
};
```
In-progress job timer `#jobMathTimer_1234` is updated by the silent on-site timer
IIFE (`tech_ipad_v3.html:12001-12014`, seeds `onsiteTimer`; the pay drawer shows a
static "36 min · $921/hr pace").

**EWA modal** (`#ewaModal`, markup `tech_ipad_v3.html:4088-4164`; handlers
12783-12794):
```js
function openEWA()  { document.getElementById('ewaModal').style.display = 'flex'; }
function closeEWA() { document.getElementById('ewaModal').style.display = 'none'; }
function submitEWA() {
  var amt = document.getElementById('ewaAmt').textContent;
  var needsReview = parseInt(amt.replace('$','')) > 300;
  closeEWA();
  if (needsReview) { alert('💰 Advance request submitted … Over $300 = manager review … Logged to _DB_EWA_Requests …'); }
  else { alert('✅ Advance approved … Standard ACH (1–3 days) … Logged to _DB_EWA_Advances.'); }
}
```
EWA modal contents: ELIGIBLE checklist; amount `<input type="range" min=50 max=252 step=10 value=200 oninput=…>` live-updating `#ewaAmt`/`#ewaDeduct`; Speed picker (Standard $0 / Instant ⚡ $2.50); Saturday paycheck preview (Gross $1,847.50 − $432.50 − advance = Net $1,215.00); KY-law legal box; submit button "Request Advance — Sends to OM for approval". Border `2px var(--amber)`.

### 1c. Pay formula (verbatim comment `tech_ipad_v3.html:4344-4355`) — the math contract
```
Subtotal   = Revenue − Dispatch fees − (Material × markup)
Commission = Subtotal × commission rate (Setup!B13)   [demo 22%]
Material premium = (Material × markup) × premium rate
  - materials ≤ $399 → markup = 2x, premium = 10%
  - materials > $399 → markup = 1.5x, premium = 5%
+ Vacation/holiday pay (hourly base · PTO & holidays ONLY) + bonuses − deductions = NET PAY
Commission techs are commission-only — hourly NEVER stacks on job pay.
Dispatch fee capped at $125/job. Negative subtotal → commission clipped to $0.
```
Per-job math drawers (J-1219/1220/1224/1227/1228/1230/1234) show each step. Source
refs cited in comments: Tech Sheet `Code.js:858, 1489-1492` (pay), `5389-5414`
(material-% side-job alert at 0.40).

### 1d. Backend contract
No `google.script.run` in the pane markup. Real wires (from comments + related flows):
- **EWA submit** → `_DB_EWA_Requests` (>$300, pending OM) / `_DB_EWA_Advances` (auto), Plaid Transfer. (mockup uses `alert`.)
- **Send Payroll** → routes through OM (Tracey) approval per **Bridge #1** → Accounting Payroll Run (button is `disabled`).
- Payroll accrual wire seen elsewhere: `google.script.run.cbPayroll_accrue({ tech, jobId, jobTotal })` (`tech_ipad_v3.html:9565`).

### 1e. Data fields (Supabase mirror)
- **Week header/hero:** `week_label`, `gross_total`, `jobs_count`, `hours_logged`, `lock_checkpoints_done`/`lock_total` (e.g. 4/6).
- **EWA:** `net_earned`, `ewa_available` (30% of net), `ewa_max`, `last_advance_days_ago`, `outstanding_advances`, fee tiers.
- **pay-grid:** `last_week_total`, `last_week_delta`, `ytd_total`, `ytd_weeks`, `ytd_delta_pct`, `pay_type`, `rank_this_week`, `rank_delta`.
- **Fuel:** `van_id`, `gal_purchased`, `fuel_spent`, `miles_driven`, `mpg`, `mpg_tolerance_ok`.
- **Per-job margin + jobs table:** per job → `job_id`, `customer`, `address`, `ticket`/`revenue`, `hours`, `pay_earned`, `margin_status` (GREEN/RED), `amount_to_green`, `dispatch_fee`, `material_cost`, `markup_tier`(2x/1.5x), `commission_rate`, `premium_rate`, flags (`callback`,`doc_fraud`,`fb`,`in_progress`).
- **Earnings breakdown:** revenue, dispatch_total, material_2x_cost, material_15x_cost, subtotal, commission, material_premium, vacation_pay, bonuses{crown, fb, hhwp, happy_poop}, deductions{doc_fraud, callback, helper_share}, net_pay.
- **Material %:** `material_total`, `revenue_total`, `material_pct`, threshold 0.40.

---

## 2. PANE: `races` — "🏁 The Races" (`tech_ipad_v3.html:4561-5078`)
`data-tech-only="1"` — competitive $ never shown where a customer could see it.

### 2a. Markup structure (top → bottom)
1. **Header** (4564-4573): gradient `var(--amber-deep)→#2a1a0a`, "THE RACES · Week of May 25 — 31", "Matt Shepard · Pay-Type: Commission", "Crown $6,500 @ 55% · Turd $9,500 @ 55% · roast level R".
2. **🏆 Biggest Ticket — This Week** (4577-4594): amber gradient, $4,820 leader (mono `var(--amber)`), "Tech #1 · 🌊 FB Sump · 62% mar", "You: $2,140" (`var(--green-bright)`), "+$50 bonus" pill.
3. **⚡ Weekly Challenges · LIVE BOUNTIES** (4606-4650): purple `#ba68c8` border, "2 active". Two challenge cards (First-to-$1K-lunch w/ 68% progress bar; Hybrid Heater Bounty +$100, 6 days). "Devin fires new bounties anytime from Owner menu · iPad updates within 60s".
4. **Award Gate banner** `#awardGateBanner` + `#awardGateIcon/Title/Sub` (4653-4659): green when clean ("ALL AWARDS LIVE"). IDs imply JS toggling.
5. **4-Strike grid** (4662-4696): `#strikeLate #strikeReview #strikeMargin #strikeCallback`. LATE 0/0, 1-3★ 0/0, <55% 0/0 (green `#4caf50`); CALLBACK 1/1 (amber `#ffc107`, "1 more = DQ"). Explainer box (4699-4701, left `#64b5f6`).
6. **THE STACK** (4706-4812): 2px amber, single revenue bar `$0→$9,500`. Fill at **61.5%** (`.stack-fill-shine`, gradient `amber-deep→amber→amber-bright→#fff44f`). Crown checkpoint at **68.4%** ($6,500, +$150, `animation:checkpointPulse`); Turd at 100% ($9,500, +$250, `animation:turdShake`, locked). Plunger 🪠 marker (`plungerBob` + `plungerGlow`), sparkles (`sparkle`), 🏁 flicker. Position summary "$5,840 · GREEN · qualified", "🌽 $660 to Crown" / "💩 $3,660 to Turd". **🚨 The Big Number** (4766-4776): `bigNumberGlow`, **$29/hour to Crown by Saturday** ($660 ÷ 23 hrs). Stage coaching (Corn green / Turd gray). Salary-tech variant box (Crown $7,500/Turd $11,000 + rollover). Thresholds cited from Tech Sheet `Code.js:62-64`: CROWN=$6,500 TURD_G=$9,500 MIN_MAR=0.55 CROWN_BONUS=$150 TURD_BONUS=$250; CROWN_SAL=$7,500 TURD_SAL=$11,000.
7. **This Week's Race** (4816-4895): horizontal lane bar-graph, lane width % = tech_rev / leader_rev. Tech #1 100% (gold `#ffd54f`), **Matt #2 (YOU) 69.4%** (silver `#b0bec5` w/ "YOU" chip + warning line), Tech #3 61.9% (bronze `#cd7f32`), #4 45.4%, #5 34.9% (gray, "💀 no $$"). Payouts "🥇 $250 · 🥈 $100 · 🥉 $50".
8. **Review Race** (4899-4978): scoring "5★=+10 · 4★=+8 · 3★=−5 · 2★=−5 · 1★=🛡 DISPUTABLE" (Devin spec supersedes Tech Sheet `Code.js:2885`). Lanes scaled to leader 66 pts. Matt #3 (YOU) 43 pts 65.2%. **1★ Dispute panel** (4958-4962) → `onclick="openDisputeModal('Tech #4','Walter Les','5/18')"`. Payouts "🥇 $150 · 🥈 $80 · 🥉 $50 · $15 floor at 5+".
9. **HHWP Race · Tech Day-Off On-Call** (4982-5004): ranked by # of day-off pickups (NOT hours). Tech #1 3×, #3 2×, #4 1×, Matt (YOU) 0× ("💀 NOTHING"). Payouts "🥇 $250 · 🥈 $100 · 🥉 $50 · 4th+ 💀 NOTHING".
10. **🪠 Hank Roast** (5007-5023): purple `#9c64f4` border, level R, "3 races · 0 wins". Roast text on `rgba(0,0,0,.62)` left `#b388ff`, text `#f3ecff`, then green "THE PLAY this week" motivating turn (`var(--green-bright)`). "NEVER customer-facing".
11. **🏆 Trophy Case** (5026-5076): 3-col grid of 7 holder cards (Corn Crown, Golden Turd, Week's Race, Happy Poop, Helper Race, Career Tier) — each w/ all-time count.

### 2b. JS handlers (verbatim)
Dispute modal (`#disputeFormOverlay` markup `tech_ipad_v3.html:2255-2313`; handlers
12019-12045):
```js
function openDisputeModal(techName, customerName, reviewDate) {
  var ov = document.getElementById('disputeFormOverlay'); if (!ov) return;
  var title = document.getElementById('disputeFormTitle');
  if (title) title.textContent = customerName + ' · ' + reviewDate + ' · for ' + techName;
  document.querySelectorAll('input[name="disputeReason"]').forEach(function (r){ r.checked = false; });
  ov.style.display = 'flex';
}
function closeDisputeModal() { var ov=document.getElementById('disputeFormOverlay'); if (ov) ov.style.display='none'; }
function submitDispute() {
  var reason = document.querySelector('input[name="disputeReason"]:checked');
  if (!reason) { alert("Pick a reason first — Karen / Not CB's fault / False claim"); return; }
  var title = document.getElementById('disputeFormTitle').textContent;
  alert('🛡 Dispute submitted!\n\n' + title + '\nReason: ' + reason.value + ' … '
    + '(Mockup — real build POSTs to _DB_ReviewDisputes on Owner Sheet, fires Pete recording pull + notifies Ronnie/Tracey/Devin.)');
  closeDisputeModal();
}
```
Dispute modal reasons (radio `name="disputeReason"`): `karen` / `not_fault` /
`false_claim`, + free-text "Your side" textarea. Border `2px #ff8a65`.

The Award Gate (`#awardGate*`) and 4 strike tiles (`#strikeLate` etc.) have **no
JS in the gold file** — they're static-green demo state. Port: compute from
strike counts server-side; any 1 strike during Sun 00:00–Sat 23:59 forfeits ALL
awards.

### 2c. Backend contract
No `google.script.run` inline. **Dispute submit** → `_DB_ReviewDisputes` (Owner
Sheet) + Pete recording pull + notify Ronnie/Tracey/Devin (mockup `alert`).
Comments cite data sources: `_DB_Challenges` (bounties, Owner Sheet, 60s push),
`CB_BONUSES` script property (Crown/Turd status), Tech Sheet weekly `qRev` sum,
roster (pay type).

### 2d. Data fields
- **Header:** tech_name, pay_type, crown_threshold, turd_threshold, min_margin, roast_level.
- **Biggest ticket:** leader_ticket, leader_name, leader_margin, your_ticket, gap, bonus.
- **Challenges:** per challenge → title, reward, type(standing/custom), progress{you, target}, expires_days, status, source.
- **Award gate:** strikes{late, low_review, sub55_margin, callback} each {count, limit}, gate_clear bool.
- **The Stack:** qrev (current revenue), crown_threshold, turd_threshold, margin_ok, to_crown, to_turd, big_number_rate, work_hours_left, is_salary.
- **Race lanes (×3 races):** per tech → name, rank, value (revenue / review_pts / pickups), pct_of_leader, payout, is_you, dq.
- **Review race extras:** review_pts, review_count, $15-floor eligibility, pending 1★ dispute {customer, date}.
- **Hank roast:** roast_text, the_play_text, races_entered, wins, level.
- **Trophy case:** per award → current_holder, value, all_time_count.

---

## 3. PANE: `record` — "🏆 My Record (Career)" (`tech_ipad_v3.html:5081-5106`)

### 3a. Markup
- `<h1>` "🏆 My Record (Career)" + `.sub` "Lifetime stats · pulled from _WeekArchive · never resets".
- **`.pay-grid` of 9 `.pay-card`s** (5085-5095): Total Revenue $847,320 (since 2022-06); Total Pay $186,408 (avg $46,602/yr); Jobs Closed 2,184 ($388 avg ticket); Avg Rating 4.82⭐ (347 reviews); Best Week $2,894 (Week of 2024-09-15); Biggest Job $5,840 (🌊 FB · Pierce · 2024-11-08); Longest Streak 11 weeks (on-time + 5★); Memberships Sold 84 ($420 avg recurring); Referrals Earned 17 ($340 in credits).
- **`.info-card` "📈 Monthly Compare (last 6)"** (5097-5105): 6 `.row`s, each `lbl`=month, `v`="$X · N jobs · R★" (Feb 2026 flagged ⚠).

### 3b. JS / 3c. Backend
None — fully static. No `google.script.run`. Comment cites source `_WeekArchive`.

### 3d. Data fields
career: `total_revenue, total_pay, avg_pay_per_yr, jobs_closed, avg_ticket,
avg_rating, review_count, best_week{amount,week}, biggest_job{amount,label,date},
longest_streak, memberships_sold, avg_recurring, referrals_earned, referral_credits`;
monthly_compare: `[{month, revenue, jobs, rating, flagged}]`.

---

## 4. PANE: `board` — "📊 Leaderboard · This Week" (`tech_ipad_v3.html:5109-5154`)
> Reached via nav button `id="nav-board"` (labeled "🎰 Vegas" — see §0 GOTCHA).

### 4a. Markup
- `<h1>` "📊 Leaderboard · This Week" + `.sub` "Live · refreshes every 10 min · pulls from Owner Sheet rank push".
- **"YOU ARE" hero** (5113-5117): amber gradient, big mono **#2** (`var(--amber)`), "$1,847.50 this week · need $256 more to take #1".
- **5 `.lb-row`s** (5119-5143): #1 Brandon Parks $2,103.40 (`.gold`), #2 Matt Shepard (YOU) $1,847.50 (`.silver .me`), #3 Dylan Hasson $1,640.20 (`.bronze`), #4 Elmer Rader $1,425.00, #5 Kade Dow $1,308.75. Each: `.lb-rank` / `.lb-name` / `.lb-stat`.
- **"🌟 Other Awards This Week" `.info-card`** (5146-5153): 👑 Booking King → Brandon (12 same-day adds); 🌊 FloodBusterz → Matt (1 approved · $1,840); 📷 Photo King → Dylan (87 photos); 🤝 HHWP MVP → Matt (day-off on-call); ⭐ Highest CSAT → Elmer (4.95 avg).

### 4b. JS / 4c. Backend
None inline — static. Comment cites "Owner Sheet rank push", 10-min refresh.

### 4d. Data fields
`you_rank, you_total, gap_to_first`; leaderboard `[{rank, name, total, is_you, medal}]`;
other_awards `[{award_label, winner, detail}]`.

---

## 5. PANE: `vegas` — "🎰 Vegas · Achievements" (`tech_ipad_v3.html:5157-5234`)

### 5a. Markup
1. **Player Card** (5162-5172): amber gradient, 2px amber, glow shadow. 👑 emoji, "CROWN PLUNGER · LEVEL 7", "Matt Shepard" (mono `var(--amber)`), XP progress bar 84% (gradient `amber-deep→#fff44f→amber-bright`), "84% to 🪅 LEGEND · 2,340 / 2,800 XP".
2. **Tier Ladder** (5175-5203): horizontal scroll, 7 tiers 🌱 Rookie(1-2) → 🔧 Apprentice(3-4) → 🪠 Drain Slayer(5) → 🤠 Sewer Sheriff(6) → 👑 **Crown Plunger ★Lvl7 (YOU)** (`animation:pulse`) → 🪅 Legend(8-10 next). Footnote of Legend unlocks.
3. **⚡ Power Plunger Hour · ROLL FOR A BONUS** (5206-5215): purple `#ba68c8` 2px, 3 reel tiles (💵 🪠 7) `font-size:42px`, **`<button onclick="rollSlots()">🎰 PULL · 2 free rolls left</button>** (gradient `#ba68c8→#6a1b9a`). "Earned: 1 roll for selling membership · 1 roll for 5★ review · Bonuses range $5-$50".
4. **Recently Earned** `.achv-grid` (5218-5226): 6 `.achv.earned` — 👑 Crown / 🌊 FloodBuster / 🤝 Helper of the Week / 📸 Photo Pro / 🎯 9 AM Sniper / 🌟 Sewer Master Cert.
5. **Locked (next up)** `.achv-grid` (5229-5233): 3 `.achv` — 🥇 Booking King / ⚡ Power Plunger Hour / 💯 Hundred Club.

### 5b. JS handlers (verbatim)
`rollSlots` (`tech_ipad_v3.html:12047-12078`) — reads `#pane-vegas div[style*="font-size:42px"]` reels:
```js
function rollSlots() {
  var reels = document.querySelectorAll('#pane-vegas div[style*="font-size:42px"]');
  if (!reels.length) return;
  var symbols = ['💵','🪠','7','💎','👑','🎰','🔥','⭐'];
  var spinCount = 0;
  var spinInterval = setInterval(function () {
    reels.forEach(function (r) { r.textContent = symbols[Math.floor(Math.random()*symbols.length)]; });
    spinCount++;
    if (spinCount > 18) {
      clearInterval(spinInterval);
      var roll = Math.random();
      if (roll > 0.95) { reels[0..2]='👑'; …alert('🎰🎰🎰 JACKPOT — TRIPLE CROWN! +$50 … Logged to _DB_TechBonuses.'); }
      else if (roll > 0.7) { reels='💵'; …alert('🎰 TRIPLE CASH! +$25 … _DB_TechBonuses.'); }
      else if (roll > 0.4) { '🪠🪠7'; …alert('🎰 TWO PLUNGERS +$10 + 50 XP'); }
      else { random reels; …alert('🎰 No match … +10 XP. Next roll unlocks at next 5★ review.'); }
    }
  }, 80);
}
```
Weighted outcomes: >0.95 jackpot 👑👑👑 +$50/+250XP; >0.7 cash 💵💵💵 +$25/+100XP;
>0.4 🪠🪠7 +$10/+50XP; else no-match +10XP.

Related celebration FX (close-out → "Go Vegas", `tech_ipad_v3.html:9468-9500`):
`cbCloseRollsEarned_()` (banks a roll only on real membership-sold or 5★ signal),
`cbCelebrateClose_(opts)` (populates `#cbCelebrateJob/#cbCelebrateXp/#cbCelebratePull/#cbCelebrateRollNote`),
`cbCelebrateGoVegas_()` → `navTo('vegas')`.

### 5c. Backend contract
Mockup `alert` only; cited sink **`_DB_TechBonuses`** for slot payouts. Real roll
should be server-authoritative (don't let the client decide $ outcomes).

### 5d. Data fields
player_card: `tier_name, level, xp, xp_to_next, next_tier`; tier_ladder (static
config); slots: `free_rolls`, earned_roll_reasons; achievements: `[{icon, label,
desc, earned}]`.

---

## 6. PANE: `pto` — "📅 Time Off & Holidays" (`tech_ipad_v3.html:5356-5525`)

### 6a. Markup
1. `<h1>` + `.sub` "1 week vacation (40 hrs) + 5 paid holidays · all paid at HOURLY rate (no commission) · routes through Field Supervisor".
2. **`.pay-grid` 4 cards** (5361-5366): Vacation Balance 40 hrs (resets Jan 1); Used YTD 0 hrs; Paid Holidays 5/yr ("$X each · 8 hrs hourly"); On-Call Weekends 2 of 8 (next June 14-15, `var(--blue)`). No sick card — CB doesn't offer sick.
3. **Unexcused absence counter** (5371-5394): green `#4caf50` 2px. "2 unexcused = ALL 5 holidays FORFEITED". Big mono **0 / 2** "CLEAR ✓". Progress bar w/ 50% warning `#ffb74d`, 100% red `#ff5252` markers. Cites Tech Sheet `AutoFill_412_1e.js:13-21, 560-597`.
4. **`.send-payroll-btn` "+ Request Vacation"** (5396): `onclick="alert('Request Vacation modal opens …')"` (no real modal in gold).
5. **Pending Requests `.info-card`** (5398-5402): June 12 PENDING FS (`var(--yellow-bright)`); July 4-7 APPROVED✓ (`var(--green-bright)`).
6. **Holidays & on-call coverage** (5408-5463): "● Paid holidays · 8hr hourly (5)" — 5 cards (Memorial Day today / July 4 / Labor Day / Thanksgiving / Christmas), each w/ Tech+Helper+Sup chips + "PAID · 8hr" badge (`rgba(76,175,80,.15)`/`var(--green-bright)`). Then "● Non-paid holidays" — 6 cards (New Year / MLK / Juneteenth / Veterans / Christmas Eve …) "NON-PAID · OT if worked" badge (`rgba(255,183,77,.13)`/`#ffb74d`). YOU chips amber.
7. **Salary Tech PTO burn-down hierarchy** (5472-5515): amber gradient. 3 steps — 1️⃣ Holiday days absorb first (5 left, `#4caf50`); 2️⃣ Vacation absorbs next (40 hrs, `var(--amber)`); 3️⃣ PRO-RATED salary dock (`#ff5252` "LAST RESORT"). Warning box (`#ff8a65`): 2+ unexcused → performance review. Cites `AutoFill_412_1e.js:491, 582` (built) vs pro-rated dock (spec only).
8. **Pay-rule explainer box** (5518-5524, `rgba(255,179,0,.06)`): vacation/holiday = hourly base, NO commission; 2+ unexcused = forfeit; excused vs unexcused definitions.

### 6b/6c. JS / Backend
No render fn, no `google.script.run` inline. Only `alert` stubs. Backend cited:
Tech Sheet `AutoFill_412_1e.js` (holiday forfeit + vacation burn ledger LIVE;
pro-rated dock = spec); on-call roster set by OM 30+ days out via **Bridge #5**.

### 6d. Data fields
`vacation_balance_hrs, vacation_used_ytd, paid_holidays_per_yr, oncall_weekends{done,total,next}, unexcused_count, unexcused_limit(2), is_salary`;
holidays `[{date, name, paid bool, oncall{tech, helper, sup}}]`;
pending_requests `[{label, status}]`; burn_down{holidays_left, vacation_hrs_left}.

---

## 7. PANE: `eod` — "🌙 End of Day" (`tech_ipad_v3.html:2567-2645`)

### 7a. Markup
1. `<h1>` "🌙 End of Day, Matt" + `.sub` "Tuesday May 26 · 4 jobs closed · $1,847.50 today · go home clean".
2. **Day Summary hero** (2573-2581): gradient `var(--amber-deep)→surface-1`, 5-col mono grid — 4 Jobs closed (`var(--amber)`) / $1,847 Earned today (`#4caf50`) / 9.2h Clocked / GREEN Margin avg (`#4caf50`) / ↑#2 Rank gained.
3. **Tools Check-In** (2584-2596): "7 of 7 ✓" green badge, body text `#a5d6a7`. "auto-compared to morning".
4. **Cash Custody · today** (2599-2617): gradient `#5a3a1a→surface-1`, 2px amber, "$185 IN HAND" badge. Detail box (Linda Reynolds · $185 cash · receipt #104808-CASH · §21). Two buttons: **"✓ Dropping at office tonight"** (`onclick=alert(...)`, green gradient, logs `_DB_CashCustody`, separation-of-duties Ashley counts/Tracey writes) + "📦 Hold to Monday 8am".
5. **Van #14 · End of shift** (2620-2637): odometer `<input type=number placeholder=84,547>` + gas level `<select>` (Full/3/4/1/2/1/4/Below). "26 miles driven · ~1.9 gal expected · fuel anomaly check Sunday".
6. **Final Submit** (2641-2643): **`<button onclick="alert('🌙 End of day complete …')">🏁 Clock Out · Go Home Clean</button>** (amber gradient `var(--amber-bright)→var(--amber-deep)`, text `#1a1a1a`).

### 7b/7c. JS / Backend
No render fn. Both buttons are `alert(...)` stubs (no real `google.script.run`).
Cited sink: `_DB_CashCustody`; Office notified per §21; fuel anomaly check Sunday.
(Real eod close flow's `google.script.run` wires — `cbDur_record`,
`cbEst_open/setOutcome`, `cbPayroll_accrue` — live in the job close-out handler
`tech_ipad_v3.html:9542-9565`, not this pane.)

### 7d. Data fields
hero: `jobs_closed, earned_today, hours_clocked, margin_avg, rank_delta`;
tools: `tools_back, tools_total`, morning-diff note; cash_custody: `cash_in_hand`,
`[{customer, time, amount, receipt_no, job_type}]`, §21 policy; van: `morning_odo`,
`morning_gas`, `end_odo`, `end_gas`, `miles_driven`, `expected_gal`.

---

## 8. PANE: `reviews` — "⭐ My Reviews" (`tech_ipad_v3.html:6141-6167`)

### 8a. Markup
- `<h1>` "⭐ My Reviews" + `.sub` "Live from Google · CB Review Watcher pushes new ones every hour".
- **`.pay-grid` 4 cards** (6145-6150): Avg Rating 4.82⭐ (347 reviews); This Month 14 new (12×5★ · 2×4★); Quoted by Name 84% ("Matt was great", `var(--green-bright)`); 1-star this year 1 (Walter L. · 5/18 ⚠, `var(--red-bright)`).
- **3 `.review-card`s** (6152-6166): each `.stars` (⭐ string) / `.who` (name · age) / `.body` (italic quote). Jennifer R. (5★), Tom S. (5★), Maria K. (4★).

### 8b/8c. JS / Backend
None inline — static. Cited source: "CB Review Watcher" pushes hourly from Google.
(1★ dispute flow lives in the Races pane, §2b.)

### 8d. Data fields
summary: `avg_rating, review_count, this_month_count, this_month_breakdown,
quoted_by_name_pct, one_star_year{count, customer, date}`;
reviews: `[{stars(int), reviewer, age/date, body, rating_label}]`.

---

## Appendix — surprises / gaps for the porter
1. **These panes are demo-static.** No `renderX()` and no `google.script.run` in
   any of the 8 pane bodies. The only live JS that touches them: the Pay $$$
   count-up animation, `toggleJobMath`, `rollSlots`, and the EWA/Dispute modals.
   Everything else is hardcoded "Matt Shepard" demo data → wire to Supabase.
2. **Nav label mismatch:** `nav-board` is labeled "🎰 Vegas" but routes to the
   Leaderboard (`pane-board`); the slots pane is `pane-vegas` (reached from the
   Wins header card / close-celebration). Decide intended behavior.
3. **Award Gate + 4 strike tiles** in Races have IDs (`#awardGateBanner`,
   `#strikeLate`…) implying JS, but **no JS exists** in the gold file to drive
   them — they're frozen green. You must compute strike state server-side.
4. **Client-decided slot payouts** (`rollSlots`) and EWA approve/review threshold
   are client-side in the mockup — move both server-side (audit trail; don't let
   the iPad mint bonuses or self-approve advances).
5. **Color tokens diverge in light mode** (esp. `--green-bright` becomes the dark
   `#1B5E20`, and `--amber-deep` inverts to a *light* `#FFE0A0`). Many greens/reds
   are **hardcoded hex** (`#4caf50`, `#ff8a65`, `#ffd54f`, medal `#ffd700/#c0c0c0/
   #cd7f32`) not tokens — the gold file patches them with `body.light-theme
   [style*=...]` rules (lines ~132-197). Port that override map or you'll get
   unreadable text on light theme.
6. **Source-of-truth refs to honor:** pay formula + thresholds quoted from Tech
   Sheet `Code.js` (62-64 Crown/Turd, 858/1489-1492 pay, 2129-2178 Stack,
   2215-2219 Big Number, 2885 review scoring, 5389-5414 material-% alert) and
   `AutoFill_412_1e.js` (holiday/vacation ledger). DB sinks named in comments:
   `_DB_EWA_Requests/_Advances`, `_DB_ReviewDisputes`, `_DB_TechBonuses`,
   `_DB_CashCustody`, `_DB_Challenges`, `CB_BONUSES` script property.
