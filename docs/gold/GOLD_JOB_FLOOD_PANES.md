# GOLD — Job / FloodBusterz Panes + Cross-Cutting Overlays

Deep faithful-port extraction from the gold tech-iPad SPA.

**Source (verbatim, read-only):** `C:\Users\devin\OneDrive\Documents\CB_Ecosystem\mockups\tech_ipad_v3.html` (13,324 lines)
**Target port:** Next.js + Supabase web app (`sheetz-web`). Port FAITHFULLY — same layout, same functions, same colors.

---

## How to read this doc

Each pane / overlay section has:
1. **MARKUP** — exact line range + structure + every color (hex + `var(--token)`), with hardcoded-hex-on-dark contrast flags.
2. **JS** — render fn(s) + handlers with line ranges (verbatim or signature-level where noted).
3. **SERVER CALLS** — every `google.script.run.…serverFn()`: client fn, server fn, args, success shape.
4. **DATA FIELDS** — element ids, dataset keys, object props consumed.

### Theme tokens (`:root`, lines ~10–17) referenced throughout
```
--bg:#0e1116  --surface-0:#11151c  --surface-1:#161a22  --surface-2:#1d222c  --surface-3:#262c38
--fg:#ecedef  --fg-1:#ecedef  --fg-2:#b6bac3  --fg-3:#767c8a
--border:#232834  --border-strong:#2e3543
--amber:#FFB300  --amber-dim:#D4A55A  --amber-deep:#3A1A0A  --amber-bright:#FFD54F
--green:#1B5E20  --green-bright:#4caf50
(--yellow-bright, --red-bright, --blue referenced in places; resolve from <style>)
```

### Pane show/hide mechanism
All panes are `<div class="view-pane" id="pane-X" style="display:none;">`, toggled by `navTo(name)` (line 8598) / `cbDrawerPane(name)` (line 9668). `navTo` has a per-pane entry-point switch that calls the right loader (see each pane). **Most panes have NO dedicated render fn** — they are static markup; "live" behavior comes from a handful of loaders + the shared close-job gate `CB_GATE` (line 9427).

### `navTo` entry-point hooks (verified line refs)
```
name === 'van'      → vanOilRender(); vanHealthLoad();   (8626)
name === 'mkt'      → cbMktLoad_();                       (8625)
name === 'drycalc'  → cbDry_ensureInit_(); cbDry_recompute(); (8628)
name === 'moisture' → cbMz_loadPoints();                  (8629)
```
On job open (line ~9592–9593): `cbApplyGasGateVisibility()` + `cbApplyConfidential()`.

---

# PART 1 — JOB-FLOW PANES

---

## PANE `pane-po` — Purchase Order + after-hours on-call FS routing

### 1. MARKUP — lines **3250–3411**
Structure: customer-pin header (3253) → blue PO card (hardcoded `PO 104812`, 3262–3268) → QR-svg + office/after-hours phone card (3271–3285) → 6 hardcoded vendor buttons + "Other vendor" button (3288–3312) → reveal-on-tap "Other vendor" name-input panel (3314–3335) → **inline `<script>` 3336–3393** (the `cbOtherVendor*` helpers) → "snap the receipt" green card (3395–3404) → "why we do this" blue footer (3407–3409).

**Colors:**
- Tokens: `--surface-1`, `--surface-2`, `--amber`, `--amber-dim`, `--border`, `--fg-1`, `--fg-2`, `--fg-3`, `--green-bright`.
- Hardcoded hex: `#1a2a3a` (pin gradient); `#0d47a1`/`#1976d2`/`#64b5f6`/`#bbdefb`/`#90caf9` (blue PO card + footer accent); `#ffffff`/`white`/`#0b0b0b` (QR svg); `#1a3a2a`/`#4caf50`/`#1b5e20` (receipt green card); `#1a1a1a` (button fg when active, set by JS line 3363); shadows `rgba(25,118,210,0.4)`, footer bg `rgba(33,150,243,0.05)`, confirm bg `rgba(76,175,80,0.08)`, text-shadow `rgba(0,0,0,0.4)`.

**⚠ Hardcoded-hex-on-dark flags:**
- Line 3267: `#90caf9` text on the medium-blue gradient — lowest-contrast text in the card.
- Line 3408: `#64b5f6` foreground text on the very dark footer (`rgba(33,150,243,0.05)` over `--surface`) — low-sat blue on near-black; verify AA.

### 2. JS
- **On-call FS injector (the only live binding):** lines **7956–7962** (inside the main profile render). Writes `#po-oncall-fs.textContent = p.onCallFS.name + ' (FS)' + (': '+phone)`. Default markup value (line 3283) is `Bryce (FS): (606) 469-5053`.
- **Inline vendor `<script>` (3336–3393):**
  - `cbOtherVendorEsc_(s)` (3337) — HTML-escape.
  - `cbOtherVendorOpen()` (3342) — reveals `#otherVendorPanel`, focuses input.
  - `cbOtherVendorTyping()` (3355) — enables Attach btn at ≥2 chars.
  - `cbOtherVendorAttach()` (3373) — **UI-only; explicit TODO backend comment (3378–3380): "attach unlisted-vendor name to the PO record + post INTERNAL-ONLY office flag. No external send."** Writes confirm text, no network call.
  - `cbOtherVendorCancel()` (3389) — hides panel.
- Vendor buttons (3290–3307) + "Snap Receipt" (3401) = inline `alert()` mockups.

### 3. SERVER CALLS
**None.** `p.onCallFS` comes from the already-loaded global profile (the OM On-Call Roster rotation), not a pane call. PO/vendor wiring is unbuilt (TODO 3378). For the port these become real API routes.

### 4. DATA FIELDS
- Element ids: `po-oncall-fs`, `otherVendorBtn`, `otherVendorPanel`, `otherVendorName`, `otherVendorAttach`, `otherVendorConfirm`.
- Object props: `p.onCallFS.name`, `p.onCallFS.phone`.
- Hardcoded mock: PO `104812`, office `(859) 408-3382`, default FS `Bryce (606) 469-5053`, pin `Jane Smith · drain unclog · 123 Oak St`.

---

## PANE `pane-comms` — Customer communication log

### 1. MARKUP — lines **3552–3653**
Structure: customer-pin (3555–3562) → recording legal-disclosure banner (3565–3567) → Call/Text initiate buttons (3570–3585) → timeline header (3588) → CSR call card + Play (3591–3604) → 4 threaded message bubbles incl. "$$ PROOF" inbound-agree bubble (3606–3637) → compose box with quick-reply chips + Hank-draft chip (3640–3651).

**Colors:**
- Tokens: `--amber`, `--amber-dim`, `--amber-deep`, `--surface-1`, `--surface-2`, `--border`, `--fg-1`, `--fg-2`, `--fg-3`.
- Hardcoded hex: `#1a2a3a` (pin); `#5a1a1a`/`#8a2020`/`#d32f2f`/`#ffcdd2` (red Call btn); `#0d47a1`/`#1976d2`/`#64b5f6`/`white` (blue Text btn); `#2a1a3a`/`#9c64f4`/`#c8a8ff` (purple CSR card); `#1a1a1a` (amber-bubble text); `#5a4a1a` (amber-bubble timestamp); `#1a3a2a`/`#0f2a1a`/`#a5d6a7`/`#4caf50`/`#6b8e63`/`white` (green proof bubble); disclosure bg `rgba(255,179,0,0.06)`; transcript bg `rgba(0,0,0,0.2)`.

**⚠ Hardcoded-hex-on-dark flags (fix in port):**
- Lines 3610 / 3626: `#5a4a1a` (dark brown) timestamp on the amber bubble (`--amber-deep #3A1A0A` deep end) — **dark-on-dark**.
- Line 3635: `#6b8e63` (olive) timestamp on dark-green bubble (`#1a3a2a→#0f2a1a`) — borderline low contrast.

### 2. JS — handlers
- `callJaneRecorded()` — **11531–11546.** Reads `window._cbActiveJob`; sanitizes `j.customerPhone`, confirms, `window.location.href = 'tel:'+tel`. Demo fallback dials `8595550123`.
- `cbCustomerTextSend()` — **11921–11936.** Reads `#newTextBox`, runs `cbTextGuard_(text)`; `empty`→return; block→"🛡 Message blocked" alert + red-border flash; pass→"💬 Text sent via CB Twilio A2P 10DLC ✓ Saved to _DB_CustomerComms ✓ Linked to 104812" **alert (mockup, no network)** + clears box.
- `cbTextGuard_(text)` — **11902–11920.** Profanity/blocklist guard vs `CB_TEXT_BLOCKLIST` with de-obfuscation. Returns `{ok, reason, word}`.
- `cbAskReviewChip_()` — **13307–13315.** If `window._cbReviewPaused` → alert+bail; else sets `#newTextBox.value` to the Google review link (`g.page/r/CQXiy2fUkBGVEAE/review`).
- Same-domain helpers: `cbTextCustomer()` 11547–11557, `playCsrCall()` 11558–11560.
- Inline-in-markup: Call→`callJaneRecorded()`, Text→focus `#newTextBox`, Play→`alert('▶ Playing CSR call...')`, "Running late"/"I'm here" chips set `#newTextBox.value`, Hank-draft chip canned `alert()`.

### 3. SERVER CALLS
**None.** Real send (Twilio A2P → `_DB_CustomerComms`, link job `104812`, 7-yr retention) is described in copy but **not wired**; `callJaneRecorded` uses a `tel:` deep-link.

### 4. DATA FIELDS
- Element ids: `newTextBox`, `askReviewChip`.
- Globals: `window._cbActiveJob` → `.customerPhone`, `.customerName`/`.customer`; `window._cbReviewPaused`; const `CB_TEXT_BLOCKLIST`.
- Backend targets in copy: `_DB_CustomerComms`, A2P 10DLC, 7-year retention, job `104812`.
- Mock: `Jane Smith · (859) 555-0123`, gate code `4421`, review URL `g.page/r/CQXiy2fUkBGVEAE/review`.

---

## PANE `pane-finance` — Customer financing / pre-qual (+ apply modal)

### 1. MARKUP — pane **3656–3774** + apply modal `#financeApplyModal` **3776–3831** (modal lives just outside the pane div)
Structure: pre-qual hero banner ($8,000 via Wisetack, 3658–3668) → `<h1>💳 Financing</h1>` + sub (3670–3671) → Hank pitch card w/ Copy (3673–3683) → 5 plan cards (3688–3746, each `grid auto/1fr/auto` w/ "Pick →") → action row (Text apply link / Print handout, 3748–3752) → tech-reminders legal box (3754–3761) → provider-stack list (3763–3772). Modal (3776–3831): tech-fills summary, customer-fills list, text-preview bubble, "Send Jane the link" submit, "apply on this iPad instead" fallback.

**Colors:**
- Tokens: `--surface-1`, `--surface-2`, `--border`, `--amber`, `--amber-dim`, `--fg-1`, `--fg-2`, `--fg-3`.
- Hardcoded hex: `#1a3a2a`/`#0f2a1a`/`#4caf50`/`#a5d6a7` (green); `#2a1a3a`/`#ba68c8`/`#ce93d8`/`#ffffff` (purple Hank); `#1b5e20` (green btn); `#0d47a1`/`#1976d2`/`#64b5f6`/`#90caf9`/`#1c2733`/`white` (blue modal); `#0f0d08` (modal bg end); `rgba(76,175,80,0.2/0.05)`, `rgba(33,150,243,0.05)`, `rgba(255,179,0,0.05)`, scrim `rgba(0,0,0,0.88)`.

**⚠ Flag:** Line 3681 — inline `<strong style="color:#4caf50">$20 a month</strong>` (green) on dark-purple `#2a1a3a` card; saturated-on-saturated, verify AA. Other accent texts are light-on-dark (fine).

### 2. JS — handlers
- `openFinanceApply()` — **12773.** `#financeApplyModal.display='flex'`.
- `closeFinanceApply()` — **12774.** `'none'`.
- `confirmFinanceText()` — **12775–12780.** Closes modal, then (200ms) alert "✅ Text sent to Jane … Webhook: finance_status_callback → _DB_FinanceApps" (mockup).
- Inline: Copy-pitch `alert('✓ Copied')`; the 5 "Pick →" buttons have **no onclick** (static); Print-handout + "apply on this iPad" = `alert()`.
- **NOT financing:** `openLoanModal()`/`submitLoan()` (11761–11776) belong to the tool-loan/custody feature (`_DB_ToolCustody`). Do NOT wire them here.

### 3. SERVER CALLS
**None.** `confirmFinanceText` is an alert. Intended backend (copy only): Wisetack text-a-link → soft pull → `finance_status_callback` webhook → `_DB_FinanceApps`; funded amount auto-flows to invoice and sets commission base.

### 4. DATA FIELDS
- Element id: `financeApplyModal`.
- Mock (no bindings): pre-qual `$8,000`, soft-pull `2025-08-12`, ticket `$685`, 5 plans ($20/36mo 0%, $57/12mo same-as-cash, $31/24mo 6.99%, $17/48mo 9.99%, $114/6mo 0%), providers (Wisetack primary, Synchrony/Sunbit backup, GreenSky disabled), `Jane Smith / (859) 555-0123 / job 104812`, link `wisetack.us/cb/jane-0512`.
- Backend targets in copy: `_DB_FinanceApps`, webhook `finance_status_callback`.

---

## PANE `pane-receipt` — Send Invoice + Receipt

### 1. MARKUP — lines **3164–3247** (verbatim below)
```html
<div class="view-pane" id="pane-receipt" style="display:none;">

  <!-- CUSTOMER PIN -->
  <div style="background:linear-gradient(135deg,#1a2a3a 0%, var(--surface-1) 100%);border:1px solid var(--amber);border-radius:10px;padding:10px 14px;margin-bottom:12px;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;">
    <span style="font-size:22px;">📌</span>
    <div>
      <div style="font-size:10px;color:var(--amber-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Receipt for</div>
      <div style="font-size:15px;color:var(--fg-1);font-weight:800;">Jane Smith · 104812</div>
    </div>
  </div>

  <!-- PAYMENT CONFIRMED BANNER -->
  <div style="background:linear-gradient(135deg, #1a3a2a 0%, #0f2a1a 100%);border:2px solid #4caf50;border-radius:12px;padding:18px 20px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:14px;">
      <span style="font-size:36px;">✅</span>
      <div style="flex:1;">
        <div style="font-size:11px;color:#a5d6a7;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">PAYMENT RECEIVED</div>
        <div style="font-size:28px;font-weight:800;color:#4caf50;font-family:'JetBrains Mono',monospace;">$491.84</div>
        <div style="font-size:11px;color:#a5d6a7;">Visa ending 4242 · Stripe · 2026-05-26 1:47 PM</div>
      </div>
    </div>
  </div>

  <h1>📧 Send Receipt</h1>
  <div class="sub">Where should Jane's receipt go? Pick one or more.</div>

  <!-- EMAIL ON FILE (prefilled) -->
  <label style="background:var(--surface-2);border:2px solid #4caf50;border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;cursor:pointer;">
    <input type="checkbox" checked="checked" style="width:20px;height:20px;accent-color:#4caf50;" />
    <span style="font-size:20px;">📧</span>
    <div style="flex:1;">
      <div style="font-size:11px;color:#a5d6a7;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">EMAIL ON FILE</div>
      <div style="font-size:14px;color:var(--fg-1);font-weight:600;">jane.smith@email.com</div>
      <div style="font-size:10px;color:var(--fg-3);">From Customer Master · last used 2024-08-12 · ✓ verified deliverable</div>
    </div>
  </label>

  <!-- TEXT THE RECEIPT -->
  <label style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;cursor:pointer;">
    <input type="checkbox" style="width:20px;height:20px;accent-color:var(--amber);" />
    <span style="font-size:20px;">📱</span>
    <div style="flex:1;">
      <div style="font-size:11px;color:var(--amber-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">TEXT the receipt</div>
      <div style="font-size:14px;color:var(--fg-1);font-weight:600;">(859) 555-0123</div>
      <div style="font-size:10px;color:var(--fg-3);">Jane consented to SMS · A2P 10DLC verified · receipt as link</div>
    </div>
  </label>

  <!-- ADD ANOTHER EMAIL -->
  <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <span style="font-size:20px;">➕</span>
      <div style="font-size:11px;color:var(--amber-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">Add another email (spouse, accountant, etc.)</div>
    </div>
    <input type="email" placeholder="name@example.com" style="width:100%;background:var(--surface-0);border:1px solid var(--border);color:var(--fg-1);padding:10px 12px;border-radius:6px;font-size:13px;box-sizing:border-box;" />
    <div style="font-size:10px;color:var(--fg-3);margin-top:6px;">Tip: Spouses often want a copy. Insurance jobs need the adjuster too. Commercial customers usually have AP at <code style="background:var(--surface-1);padding:1px 5px;border-radius:3px;font-size:10px;">accounting@&lt;company&gt;.com</code></div>
  </div>

  <!-- PRINT -->
  <label style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;cursor:pointer;">
    <input type="checkbox" style="width:20px;height:20px;accent-color:var(--amber);" />
    <span style="font-size:20px;">🖨</span>
    <div style="flex:1;">
      <div style="font-size:11px;color:var(--amber-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">PRINT FROM VAN</div>
      <div style="font-size:14px;color:var(--fg-1);font-weight:600;">Brother PJ-863 (van #14)</div>
      <div style="font-size:10px;color:var(--fg-3);">Some customers still want paper · prints in 4 seconds</div>
    </div>
  </label>

  <!-- HANK'S NUDGES -->
  <div style="background:linear-gradient(135deg, #2a1a3a 0%, var(--surface-1) 100%);border:1px solid #9c64f4;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:11px;color:var(--fg-2);line-height:1.6;">
    🪠 <strong style="color:#c8a8ff;">Hank's nudges before you finish:</strong><br />
    • <strong>Ask for a review</strong> — Jane gave 5★ last visit. She'd give one now too if you ask.<br />
    • <strong>Confirm follow-ups</strong> — Camera scope shows root at 24ft. Schedule the jet job within 2 weeks while she's warm.<br />
    • <strong>Membership pitch</strong> — Skipped earlier per tendency. Don't push, but mention "Linda Reynolds saved $185 last month" if natural.
  </div>

  <!-- FINISH BUTTON · routed through the office-required forms/evidence gate (Devin v104) -->
  <button onclick="cbTryCloseJob('done')" style="width:100%;background:linear-gradient(180deg, #4caf50 0%, #1b5e20 100%);color:white;border:none;padding:16px;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(76,175,80,0.3);">
    ✓ Send Receipt &amp; Close Job →
  </button>
  <div style="text-align:center;font-size:10px;color:var(--fg-3);margin-top:8px;">Tapping closes Job 104812 · payroll recalc · happy check queued · move to next job</div>

</div>
```

**Colors:** tokens `--surface-0/1/2`, `--amber`, `--amber-dim`, `--fg-1/2/3`, `--border`; hex `#1a2a3a`, `#1a3a2a`, `#0f2a1a`, `#4caf50`, `#a5d6a7`, `#2a1a3a`, `#9c64f4`, `#c8a8ff`, `#1b5e20`, `white`; shadow `rgba(76,175,80,0.3)`.

**⚠ Hardcoded-hex-on-dark flags:** `#a5d6a7` text 3× on dark green banners (3180/3182/3195/3197); `#4caf50` big `$491.84` fg on dark banner (3181); `#c8a8ff` Hank-nudges heading on dark-purple (3235). All bypass the `--fg-*`/`--green` tokens.

### 2. JS
- **No render fn.** Shown by `navTo('receipt')`.
- Only handler: Close button → **`cbTryCloseJob('done')`** (9502+). NOTE: receipt button passes `'done'`; the **invoice** pane's Submit button (`#submitInvoiceBtn`, line 3159) passes `'invoice'`. Same gate.

### 3. SERVER CALLS (via `cbTryCloseJob`, reachable from this button)
Inside `cbTryCloseJob`, when `stage==='done'` and live (not preview):
| client fn | server fn | args | success shape |
|---|---|---|---|
| cbTryCloseJob | `cbTechIpad_closeGate` | `{ email, jobId }` (line 9531) | `gres.ok`, `gres.block` (bool — true aborts), `gres.error` |
| cbTryCloseJob | `cbDur_record` | `{ jobId, jobType, actualMins, tech }` (9543) | fire-and-forget |

The receipt sends (email/text/print) are **mockup only** — checkboxes have no handler; no `cbReceipt_*` server call exists.

### 4. DATA FIELDS
- All values hardcoded demo (Jane Smith · 104812, $491.84, Visa 4242, jane.smith@email.com, (859) 555-0123, Brother PJ-863). No bound props in the pane.
- Close path reads globals: `window.cbTechData.email`, `.preview`, `.currentJobId`, `window.cbActiveJobId`, `window.cbActiveJobType`, `window._cbActiveJob.jobType`.

---

## PANE `pane-forms` — Forms Library

### 1. MARKUP — lines **3834–3912**
A `<h1>📝 Forms Library</h1>` + sub + a `.form-grid` of **12 `.form-tile`** cards. Tiles (some `.form-tile critical`): Excavation Authorization, Rough Backfill Acknowledgment, Home Plumbing Inspection, Service Authorization, Warranty Registration, Property Entry Consent, KY Lien Waiver/Disclosure, Photo Release, Lead Pipe Disclosure, Backflow Test Certification, Change Order, Septic Abandonment Cert. Each tile: `.ico` / `.title` / `.desc` / `.meta`.

**Colors:** **No inline colors** — fully class-driven (`.form-grid`, `.form-tile`, `.form-tile.critical`, `.ico/.title/.desc/.meta`). Colors live in `<style>`. **No hex-on-dark flags in this pane.**

### 2. JS
- **No render fn.** Shown via `navTo('forms')`.
- Only interactive tile: **Excavation Authorization** → `onclick="navTo('formfill')"` (line 3839). Other 11 tiles have no onclick (dead in mockup).
- Related (in the required-forms drawer card, lines 7341–7376, not this pane): `cbMarkFormSigned(id)` (9452) flips `CB_GATE.requiredForms[].signed=true`, recolors `reqFormRow_<id>`/`reqFormStat_<id>`, calls `cbGateRenderCard_()` (9444) + `cbActLog('FORM_SIGNED', …)`. "Fill now" buttons call `cbJobJump('forms');cbMarkFormSigned('wh_permit'|'warranty')`.

### 3. SERVER CALLS
**None.** No `google.script.run` in the library. Signing/archiving is mocked in formfill.

### 4. DATA FIELDS
- None bound — all 12 tiles static.
- Gate model `CB_GATE.requiredForms` (9428): `{ id, label, signed }`, ids `wh_permit`, `warranty`, `callback` (`callback` starts `signed:true`; others `false`).

---

## PANE `pane-formfill` — Fill a Form (Excavation Authorization)

### 1. MARKUP — lines **6170–6214** (verbatim below)
```html
<div class="view-pane" id="pane-formfill" style="display:none;">
  <h1 style="display:flex;align-items:center;gap:10px;">
    <span style="cursor:pointer;" onclick="navTo('forms')">‹</span>
    ⛏ Excavation Authorization
  </h1>
  <div class="sub">Form for Jane Smith · 104812 · 123 Oak St</div>

  <div class="form-fill">
    <h3>Customer Responsibility — Underground Lines</h3>
    <div class="legal">
I, the undersigned property owner/representative, acknowledge that Clog Busterz LLC ("CB") is performing excavation work at the address shown.

I understand that Kentucky 811 ("Call Before You Dig") marks only PUBLIC utilities (electric, gas mains, telephone, cable, water mains).

PRIVATE underground utilities — including but not limited to: lawn sprinkler lines, low-voltage landscape lighting, invisible dog fences, private gas lines to grills or pool heaters, propane lines from tank to house, underground drain lines, septic field lines, and any other unmarked underground infrastructure installed by previous owners or contractors — are MY responsibility to identify and disclose to CB before work begins.

I accept full responsibility for the cost of repair to any unmarked private underground utility damaged during the course of this work. CB is not liable for damage to private utilities not identified in writing prior to the start of excavation.

I confirm that I have either: (a) identified all known private underground utilities on the attached site sketch, OR (b) acknowledged in writing that there may be unknown private utilities and I accept the risk.
    </div>

    <h4 style="margin:14px 0 8px;font-size:12px;color:var(--amber-dim);text-transform:uppercase;">📸 Site condition photos (before dig)</h4>
    <div class="photo-row">
      <div class="photo-tile has">811 marks visible</div>
      <div class="photo-tile has">work area wide</div>
      <div class="photo-tile">+ add</div>
      <div class="photo-tile">+ add</div>
    </div>

    <div class="meta-stamp">
      <span>📍 GPS: 37.7466, -84.2949</span>
      <span>🕐 2026-05-26 14:12:33</span>
      <span>👤 Tech: Matt Shepard</span>
    </div>

    <h4 style="margin:16px 0 8px;font-size:12px;color:var(--amber-dim);text-transform:uppercase;">Customer Signature</h4>
    <div class="sig-pad" onclick="this.classList.toggle('has-signature')"></div>
    <div style="font-size:11px;color:var(--fg-3);margin:6px 0 10px;">Signing as: <strong style="color:var(--fg);">Jane Smith</strong> (property owner)</div>

    <div class="sig-actions">
      <button class="sig-clear">Clear</button>
      <button class="sig-save" onclick="alert('✓ Form signed + geo-stamped\n✓ PDF generated\n✓ Archived to Drive /CB_LegalForms/104812/\n✓ Emailed to: jane.smith@email.com + legal@clogbusterzplumbing.com\n✓ Linked to job + customer record')">Sign &amp; Save Form</button>
    </div>
  </div>
</div>
```

**Colors:** tokens only inline — `--amber-dim` (two `<h4>`), `--fg-3`, `--fg` (the "Jane Smith" strong). Rest class-driven. **No hex-on-dark flags.**

### 2. JS
- **No render fn.** Shown via `navTo('formfill')` (from the Excavation tile 3839 and drawer link 7326 `cbDrawerPane('formfill')`).
- Back chevron `onclick="navTo('forms')"` (6172). Signature pad `onclick="this.classList.toggle('has-signature')"` (6206) — CSS toggle, no JS fn. Clear button (6210) — no inline handler. Save button (6211) — inline **`alert()`** stub only.

### 3. SERVER CALLS
**None.** "Sign & Save" is an `alert()` stub describing production (geo-stamp, PDF, archive `Drive /CB_LegalForms/104812/`, email `jane.smith@email.com` + `legal@clogbusterzplumbing.com`, link to job/customer). No `google.script.run`. (Real form-signing state simulated by `cbMarkFormSigned(id)` at 9452 from the drawer, not here.)

### 4. DATA FIELDS
- All hardcoded demo: Jane Smith · 104812 · 123 Oak St; GPS `37.7466, -84.2949`; ts `2026-05-26 14:12:33`; Tech `Matt Shepard`; emails above; path `Drive /CB_LegalForms/104812/`. No element ids/dataset keys/bound props. Hard-wired to Excavation Authorization only.

---

## PANE `pane-videos` — BEFORE/AFTER video evidence + invoice-lock-until-after-video

### 1. MARKUP — lines **3915–4036**
Structure: red **BLOCKING BANNER** "Video Evidence — REQUIRED to close this job" (3917–3927) → `<h1>🎥 104812 · Jane Smith · Drain Unclog</h1>` (3929) → **Evidence Progress** bar "1 / 2 ✓" (3933–3944) → 2-tile video grid: BEFORE (done/green) + AFTER (`onclick="openVideoCapture('after')"`, amber/pending) (3947–3975) → **Guided photos** card (3983–4008) w/ `#cbGuidedCount`, `#cbGuidedGrid`, `data-shot` tiles, "📷 Snap extra photo" `cbSnapPhoto('other','')`, "📲 Also add from my phone" alert btn → excavation conditional row (dimmed, "NOT TRIGGERED") (4011–4017) → DEMO switch-to-excavation button `switchToExcavationDemo()` (4020–4022) → "Why we do this" blue explainer (4025–4035). Hidden file input `#cbVidInput` at **4169**.

**Colors:** tokens `--surface-1/2`, `--border`, `--border-strong`, `--amber`, `--amber-dim`, `--amber-deep`, `--amber-bright`, `--green-bright`, `--fg-1/2/3`, `--blue`; hex `#5a1a1a`/`#8a2020` (red banner + demo btn), `#ff5252` (red border), `#ffcdd2` (title), `#ffe5e5` (body), `#1a3a2a` (green tile), `#3a2a1a` (amber tile), `#1a1a1a` (text on amber), `#2a1f1a` (excavation), `#888`/`#bbb` (dim), `#1a2a3a` (explainer), `#64b5f6` (blue), `white`; rgba `rgba(255,82,82,0.25)`, `rgba(46,125,50,0.08)`, `rgba(255,179,0,0.08)`.

**⚠ Hardcoded-hex-on-dark flags:** `#ffcdd2` (3922) + `#ffe5e5` (3923) on red gradient; `#1a1a1a` dark-on-amber badges/buttons (3963/3970/3996/4006); `#64b5f6` blue on `--surface-2` (4007) and on blue explainer (4028); `#bbb`/`#888` low-contrast greys (4014).
**Markup artifact:** literal `required="required"` leaks into visible copy at lines 3940 and 3968 (HTML-attr string in text content — almost certainly an editing artifact; render as plain text in the port or omit).

### 2. JS — handlers
- `openVideoCapture(type)` — **10965–10969:** sets `_cbVidType`, clicks `#cbVidInput`.
```js
function openVideoCapture(type) {
  _cbVidType = type || 'before';
  var inp = document.getElementById('cbVidInput');
  if (inp) { inp.value = ''; inp.click(); }
}
```
Globals: `_cbVidType` (10963), `CB_VID_CHUNK = 4*1024*1024` (10964). Input markup: `<input id="cbVidInput" capture="environment" onchange="finishRecording(this.files && this.files[0]); this.value='';">` (4169).
- `stopRecording()` — 10970–10973 (legacy cancel). `cbVidProg_(msg)` — 10974. `cbVidSliceB64_(file,start,end)` — 10975–10982. `cbVidRun_(fn,arg)` — 10983–10988 (promisified `google.script.run`).
- `finishRecording(file)` — **10990–11031** (chunked uploader — see server calls).
- `switchToExcavationDemo()` — 11032–11034 (alert demo).
- Guided photos (also in this pane): `cbSnapPhoto(kind, caption, onDone)` — **10683–10747** (downscale to max-width 1600 JPEG @0.8, grab GPS, upload). `cbGuidedShot(el, kind, caption)` — **10750–10762** (calls `cbSnapPhoto`, on success flips tile green/✅, removes `.gp-next`, calls `cbGuidedBump_`). `cbGuidedBump_()` — **10763–10768** (recompute `#cbGuidedCount` from `[data-shot="done"]`).

### 3. SERVER CALLS
Video upload chain in `finishRecording` (via `cbVidRun_` → `google.script.run.withSuccessHandler/withFailureHandler[fn](arg)`):
| client fn | server fn | args | success shape |
|---|---|---|---|
| finishRecording | `cbVideo_initUpload` | `{ jobId, fileName, mimeType, totalChunks, kind:'video', caption:_cbVidType, customerPhone }` (11002) | `init.ok`, `init.uploadId`, `init.error`/`init.errors[]` |
| finishRecording | `cbVideo_appendChunk` | `{ uploadId, index:i, base64 }` (11018) | `res.ok`, `res.error` |
| finishRecording | `cbVideo_finishUpload` | `{ uploadId }` (11010) | `done.ok`, `done.error` |
| finishRecording | `cbVideo_abortUpload` | `{ uploadId }` (11029, on catch) | — |
| cbSnapPhoto | `cbDispatchBoard_uploadJobPhoto` | `{ base64Jpeg, jobId, customerPhone, kind, caption, mimeType:'image/jpeg', gps:{lat,lng,acc} }` (10714–10732) | `res.ok`, `res.error`, `res.ai.flag` (`'FLAG'`→different toast) |

Args sourced from: `window.cbActiveJobId` (default `'104812'`), `file.name/type/size`, `_cbVidType`, `window.cbActiveJobPhone`, `window.cbActiveCustomerPhone`. Preview/demo branch returns `{ok:true, demo:true}` with no server call. The two BEFORE-tile buttons (▶ Preview / ↻ Retake) and "📲 Also add from my phone" are no-op/`alert()`.

### 4. DATA FIELDS
- Element ids: `cbVidInput` (hidden input), `cbVidProgress`, `videoCaptureOverlay` (+ `recTime`/`recDurCheck`/`recPrompt` legacy sim), `cbGuidedCount`, `cbGuidedGrid`.
- Dataset key: **`data-shot`** (`"done"` vs absent) — count/gate reads `[data-shot="done"]`. Class `.gp-next` (NEXT badge, removed on capture).
- Globals: `window.cbActiveJobId`, `cbActiveJobPhone`, `cbActiveCustomerPhone`, `cbTechData.preview`, `_cbVidType`, `CB_VID_CHUNK`.
- `CB_GATE.requiredVideos` (9433): `[{ id:'after', label:'AFTER walkthrough video', done:false }]`.

### 5. ★ EXACT invoice-lock-until-after-video RULE
- **Gating data:** `CB_GATE.requiredVideos = [{ id:'after', label:'AFTER walkthrough video', done:false }]` (9433–9435). In the mockup **nothing flips `done` to true** (`finishRecording` uploads but does not mutate the gate) — so the AFTER video is a permanent blocker in the demo.
- **Enforced in:** `cbCloseBlockers_()` (9437–9442) builds `missing[]` = every unsigned `requiredForms` (📝) PLUS every `requiredVideos` where `!v.done` (🎥). Single gate `cbTryCloseJob(stage)` (9502) is called by BOTH the **invoice** pane's "Submit Invoice & Collect →" (`#submitInvoiceBtn`, 3159, `cbTryCloseJob('invoice')`) and the **receipt** pane's "Send Receipt & Close Job →" (3242, `cbTryCloseJob('done')`).
```js
function cbTryCloseJob(stage) {
  var missing = cbCloseBlockers_();
  if (missing.length) {
    alert('🔒 Not yet — the office requires these before this job can ' +
      (stage === 'done' ? 'close' : 'collect payment') + ':\n\n• ' + missing.join('\n• ') +
      '\n\nFinish them from the left rail (Forms / Photos), then try again.');
    return false;
  }
  // … only when nothing missing: server photo close-gate (cbTechIpad_closeGate) then close
}
```
- **Condition that gates the invoice send:** `cbCloseBlockers_()` non-empty whenever the AFTER video `done===false` (or any required form unsigned). When non-empty, `cbTryCloseJob` **alerts and returns `false` before any payment/close action**.
- **User-facing message (verbatim):** "🔒 Not yet — the office requires these before this job can collect payment: • 🎥 AFTER walkthrough video … Finish them from the left rail (Forms / Photos), then try again." (For the receipt/"done" button the wording is "…before this job can **close**".)
- **On-screen copy:** line 3940 "Submit Invoice button stays LOCKED until all required videos are green ✓"; red banner 3922 "Video Evidence — REQUIRED to close this job."
- **Enforcement model (important for port):** the lock is enforced **functionally at submit time** (alert + early return), NOT by disabling `submitInvoiceBtn`. The button is always clickable; the gate fires on click. After blockers clear and `stage==='done'`, a server-side photo close-gate `cbTechIpad_closeGate` (9531) runs before the job actually closes (fails open on infra error).

---

# PART 2 — VAN / FLOODBUSTERZ / MARKETING PANES

---

## PANE `pane-van` — Van Maintenance service log

### 1. MARKUP — lines **5528–5594**
`<div ... id="pane-van">`: back link → `tools`, oil-due banner, Oil Change card, AI Van-Health card, Van Stats card, Van Documents card, 2 hidden `<input type="file">` (odometer + receipt), log-service button, Recent Service Log card.

**Colors:** tokens `--amber` (back), `--yellow-bright` (oilRemain 5545), `--fg-3`, `--fg-2` (vanHealthText 5562), `--green-bright` (DOT valid 5571), `--surface-3`+`--fg` (log-service btn 5585), `--amber-dim` (heading 5587). Hex: oil banner `#5a1a1a→#8a2020`, border `#ff5252`, title `#fff`, sub `#ffcdd2` (5535–5537); odometer btn `#1976d2→#0d47a1` `#fff` (5548); "Type it" btn `#FFC83D→#FF9800` `#2a1800` (5549); "Mark oil changed" `#2e7d32→#1b5e20` `#fff` (5551); Van-Health bg `rgba(156,100,244,0.12/0.03)`, border `#9c64f4` (5556), heading `#c8a8ff` (5559), badge `#4caf50`/`#06270c` (5560); doc "open PDF ›" `#64b5f6` (5578–5580).

**⚠ Flags:** `#c8a8ff` (5559) and `#64b5f6` (5578–5580) — hardcoded light text on dark, not tokenized. (`#06270c` badge fg is intentional dark-on-green.)

### 2. JS — lines **12156–12308**; entry point **8626**
- State `CB_VAN` (12157): `{ mileage:87442, lastOilMi:84210, intervalMi:5000 }`, hydrated from `localStorage('cb_van_oil')`.
- `vanOilDueAt()` 12159 = `lastOilMi+intervalMi`. `vanFmtMi(n)` 12160. `vanOilRender()` 12161–12177 (fills `oilCurMi/vanStatMi/oilLastMi/oilDueMi/oilRemain`; toggles `oilDueBanner/oilDueSub`; `oilRemain` color `#ff5252` if due, `--yellow-bright` ≤500, else `--green-bright`). `vanPersist_()` 12178. `vanPush_(type)` 12179–12185. `vanUpdateMileage()` 12186–12193. `vanSnapOdometer(input)` 12196–12219. `vanMarkOilChanged()` 12220–12225. `vanOpenDoc(kind)` 12228–12239. `vanLogService()` 12244–12254. `vanScanReceipt(input)` 12255–12277. `vanAddServiceRow_(date,desc,amount,vendor)` 12278–12284 (prepends into `#vanServiceLog` + `cbActLog('NOTE',…)`). `vanPushService_(rec)` 12285–12292. `vanHealthRender_(h)` 12294–12301 (badge color map `{KEEP:['#4caf50','#06270c'], WATCH:['#ff9800','#2a1800'], REPLACE:['#ff5252','#3a0000']}`). `vanHealthLoad()` 12302–12308.

### 3. SERVER CALLS
| client fn | server fn | args | success shape |
|---|---|---|---|
| vanPush_ | `cbFleet_logVan` | JSON `{tech,van:'14',type,mileage,ts}` | fire-and-forget |
| vanSnapOdometer | `cbFleet_readOdometer` | `b64` | `{ok, mileage}` |
| vanOpenDoc | `cbFleet_getDoc` | JSON `{van:'14',kind}` | `{ok, url}` |
| vanScanReceipt | `cbFleet_readReceipt` | `b64` | `{ok, date, desc, amount, vendor}` |
| vanPushService_ | `cbFleet_logService` | JSON `{van,tech,mileage,date,desc,amount,vendor}` | `{ok, verdict, summary}` |
| vanHealthLoad | `cbFleet_vanHealth` | `'14'` | `{ok, verdict('KEEP'|'WATCH'|'REPLACE'), summary}` |

### 4. DATA FIELDS
- Element ids: `oilDueBanner, oilDueSub, oilCurMi, oilLastMi, oilDueMi, oilRemain, odoPhotoInput, vanHealthCard, vanHealthBadge, vanHealthText, vanStatMi, svcReceiptInput, vanServiceLog`.
- State: `CB_VAN.{mileage,lastOilMi,intervalMi}`; `window.cbTechData.{email,preview}`.
- Server props: `mileage, url, date, desc, amount, vendor, ok, verdict, summary`.

---

## PANE `pane-mkt` — Marketing / Referrals

### 1. MARKUP — lines **6095–6138**
`<div ... id="pane-mkt">`: Code card (`#cbMktCode`, default `MATT-7G2`), Copy/Share buttons, "Who qualifies" green box, 4 pay-cards, disclaimer, Recent Referrals info-card.

**Colors:** tokens `--amber-deep`, `--surface-1`, `--amber`, `--amber-dim` (code card); `--surface-2`, `--fg`, `--border-strong` (Copy); `--amber`+`#000` (Share); `--fg-2`, `--fg-3`, `--green-bright`, `--yellow-bright`. Hex: qualifies bg `rgba(76,175,80,0.06)` border `#4caf50` (6109); heading + ✓ labels `#a5d6a7` (6112,6115–6118); disqualified rows `#ff8a65` (6135–6136).

**⚠ Flags:** `#a5d6a7` (6112–6118) and `#ff8a65` (6135–6136) — hardcoded light fg on dark, not tokenized.

### 2. JS — lines **8570–8597**; entry point **8625**
`_cbMktLoaded` flag 8570. `cbMktLoad_()` 8571–8578 (fills `#cbMktCode` via `cbDispatchBoard_getMyReferralCode`; preview keeps sample). `cbMktCode_()` 8579. `cbMktFlash_(text)` 8580–8584. `cbMktCopy_()` 8585–8591 (`navigator.clipboard` + `execCommand('copy')` fallback → "📋 Copied"). `cbMktShare_()` 8592–8597 (referral message w/ hardcoded `(859) 408-3382`, `navigator.share` + `sms:&body=` fallback).

### 3. SERVER CALLS
| client fn | server fn | args | success shape |
|---|---|---|---|
| cbMktLoad_ | `cbDispatchBoard_getMyReferralCode` | none | `{ok, code}` |

### 4. DATA FIELDS
- Element id: `cbMktCode`. State: `window.cbTechData`. Server prop: `code`. Pay-cards + Recent Referrals are static sample HTML.

> **NOTE — the inline `<script>` at lines 6028–6084 (`renderRecent()`/`show()`) belongs to `pane-shop` (Shop self-serve checkout), NOT `pane-mkt`.** It defines `cbShopco_init`/`cbShopco_submit`, writes to `shopcoRecent`/`shopcoMsg`, and calls `cbTechIpad_selfIssue({email,jobId,sku,qty,note,confirm})` → `{ok, needsConfirm, warning, qty, name, jobId, afterHours, message, error}`. It's just physically positioned before `pane-mkt`.

---

## PANE `pane-drycalc` — FloodBusterz Drying Calc (IICRC S500)

### 1. MARKUP — lines **6344–6385** (+ room template `#cbDryRoomTpl` 6388–6415)
`#cbDryRooms` repeater host, "Add room" button, live result card (`#cbDryMovers`, `#cbDryUnits`, `#cbDryPints`, `#cbDryBasis`, `#cbDrySummary`), send-to-manager button, disclaimer. Template: Length/Width/Ceiling number inputs, Water Class select (1–4, Class 2 selected), Inset-corners input, all `oninput/onchange="cbDry_recompute()"`.

**Colors:** tokens `--fg-3`, `--amber` (Add-room + result numbers), `--amber-dim`, `--surface-2`, `--fg-2`, `--border`, `--fg-1`, `--border-strong`; send btn `--amber-bright→--amber-deep` text `#1a1a1a` (6376). **Only hardcoded hex is `#1a1a1a` (dark-on-amber button — fine). No fg-on-dark flags.**

### 2. JS — lines **10145–10267**; entry point **8628**
**Tunable constants `CB_IICRC` (10145–10159):**
```
MOVER_BASE_PER_ROOM: 1,
AREA_PER_MOVER: { 1: 300, 2: 70, 3: 50, 4: 40 },   // sq ft floor per added mover, by class
PINT_FACTOR:    { 1: 1.0, 2: 2.0, 3: 3.0, 4: 4.0 }, // pint load per 1000 cu ft, by class
LGR_UNIT_PPD:   100                                  // rated pints/day of one LGR unit
```
**FULL FORMULA — `cbDry_calcRoom_(len,wid,ht,cls,corners)` (10162–10183), verbatim:**
```js
len = Math.max(0, Number(len) || 0);
wid = Math.max(0, Number(wid) || 0);
ht  = Math.max(0, Number(ht)  || 0);
corners = Math.max(0, Math.floor(Number(corners) || 0));
cls = (CB_IICRC.AREA_PER_MOVER[cls] ? cls : 2);   // default Class 2 if out of range

var floorSqFt = len * wid;
var cubicFt   = floorSqFt * ht;

var movers = 0;
if (floorSqFt > 0) {
  movers = CB_IICRC.MOVER_BASE_PER_ROOM
         + Math.ceil(floorSqFt / CB_IICRC.AREA_PER_MOVER[cls])
         + corners;
}
var pints = cubicFt * (CB_IICRC.PINT_FACTOR[cls] || 0) / 1000;
return { floorSqFt, cubicFt, movers, pints, cls, corners };
```
**Dehu rollup (in `cbDry_recompute`, 10243):** `units = totPints > 0 ? Math.ceil(totPints / CB_IICRC.LGR_UNIT_PPD) : 0;`
→ Per room: floor = L×W, volume = floor×H, **movers = 1 + ceil(floor / AREA_PER_MOVER[class]) + corners**, **PPD = volume × PINT_FACTOR[class] / 1000**. Totals summed; **LGR units = ceil(totalPPD / 100)**.

Other fns: `cbDry_ensureInit_()` 10186–10189, `cbDry_addRoom_()` 10190–10198, `cbDry_removeRoom_(btn)` 10199–10206, `cbDry_renumber_()` 10207–10213, `cbDry_recompute()` 10216–10255 (stashes `window._cbDryPlan = {rooms,movers,units,pints,floor,cubic}`), `cbDry_sendToManager()` 10259–10267.

### 3. SERVER CALLS
**None via `google.script.run`.** `cbDry_sendToManager` → client `cbActLog('DRYING_PLAN', detail)` + toast. No backend round-trip.

### 4. DATA FIELDS
- Result ids: `cbDryRooms, cbDryMovers, cbDryUnits, cbDryPints, cbDryBasis, cbDrySummary`.
- Template input classes: `cbDryRoom, cbDryRoomName, cbDryRoomDel, cbDryLen, cbDryWid, cbDryHt, cbDryClass, cbDryCorners, cbDryRoomCalc`.
- State: `window._cbDryPlan.{rooms,movers,units,pints,floor,cubic}`; constants `CB_IICRC`.

---

## PANE `pane-moisture` — FloodBusterz Moisture Log (IICRC S500)

### 1. MARKUP — lines **6425–6471** (pane `</div>` at 6471; views container closes 6473)
`<div ... id="pane-moisture">`: "Mark a monitored point" card (Room/Material/Location/Dry-standard inputs + Unit select), "Add monitored point" button, daily-log header + Refresh, `#cbMzPoints` list host, "AI drying check" button, `#cbMzAi` output, IICRC S500 disclaimer (6466–6470).

**Colors:** tokens `--fg-3`, `--surface-2`, `--border-strong`, `--fg-1`, `--amber`, `--amber-dim`, `--fg-2`, `--border`; AI-check btn `--amber-bright→--amber-deep` text `#1a1a1a` (6462). Static markup hardcoded hex = only `#1a1a1a` (dark-on-amber — fine). **Render JS injects status hexes:** `#69db7c` (met-standard green), `#ff7043`/`#bf360c` (stalled), `#2e7d32` (met border) — semantic state colors.

### 2. JS — lines **10280–10476**; entry point **8629**
`cbMz_hasBackend_()` 10280–10283. `cbMz_jobId_()` 10284 (`window.cbActiveJobId || cbTechData.currentJobId || '104812'`). `cbMz_esc_(s)` 10285. `cbMz_pointString_(room,material,loc)` 10291–10293. `cbMz_addPoint()` 10296–10323 (validates point + finite std; preview→`window._cbMzDemo`, live→`cbMoist_setStandard`). `cbMz_clearForm_()` 10325–10327. `cbMz_loadPoints()` 10330–10351. `cbMz_renderPoints_(points,isPreview)` 10355–10391 (cards: latest vs dry-standard, trend chip `✓ DRY · met standard` / `⏳ drying · X over` / `no reading yet`, inline reading input + Log; met green `#69db7c`/`#2e7d32`). `cbMz_logReading(idx,point,unit)` 10394–10416 (preview `metStandard = val <= dryStandard`; live→`cbMoist_addReading`). `cbMz_aiCheck()` 10419–10437. `cbMz_renderAi_(r)` 10439–10470 (verdict map `{dry_goal_met, on_track, stalled}` colors `#69db7c`/`--amber`/`#ff7043`; per-point icons `✓/⬆/▬/⬇/•`, confidence %). `cbMz_toast_(msg,ok)` 10473–10476.

### 3. SERVER CALLS
| client fn | server fn | args | success shape |
|---|---|---|---|
| cbMz_addPoint | `cbMoist_setStandard` | `{jobId,room,material,point,dryStandard,unit}` | `{ok, error?, reason?}` |
| cbMz_loadPoints | `cbMoist_points` | `jobId` | `{ok, points:[{point,room,material,unit,dryStandard,latest,latestDate,readings,metStandard}]}` |
| cbMz_logReading | `cbMoist_addReading` | `{jobId,point,reading,unit}` | `{ok, error?, reason?}` |
| cbMz_aiCheck | `cbMoist_aiCheck` | `jobId` | `{ok, overall('dry_goal_met'\|'on_track'\|'stalled'), recommendation, confidence, perPoint:[{point,trend('rising'\|'flat'\|'dropping'),metStandard,note}], reason?}` |

Backend module (source comment 6421/10274): `CB_Dispatch_MoistureLog_v1.js`, writes `_DB_MoistureLog`, AI via `claude-opus-4-8`.

### 4. DATA FIELDS
- Form ids: `cbMzRoom, cbMzMaterial, cbMzPoint, cbMzStandard, cbMzUnit` (options `%MC`/`GPP`/`REL`), `cbMzPoints, cbMzAi`; per-point input `cbMzIn_<i>`.
- Point props: `point, room, material, unit, dryStandard, latest, latestDate, readings, metStandard`.
- AI props: `overall, recommendation, confidence, perPoint[].{point,trend,metStandard,note}`.
- State: `window._cbMzDemo`, `window.cbActiveJobId`, `cbTechData.{currentJobId,preview}`.

---

# PART 3 — CROSS-CUTTING OVERLAYS / MODES

> **Z-index stacking (top→bottom):** idle lock `100000` > gas hard-stop `10001` > gas check / plate modal `10000` > custPinModal `9999` > EWA `9998` > ref modal `9997` > customer-mode banner `950`.
> **Only the gas-gate makes real `google.script.run` calls.** Customer Mode, Confidential Mode, and Idle Lock are entirely client-side in this mockup (PIN/Face ID validation mocked; production validation/logging described only in comments).

---

## A) CUSTOMER MODE — "hand the iPad to the customer" (hides pay/races/roasts)

### 1. MARKUP
**CSS (lines 371–397, 410–418):** `body.customer-mode` force-hides tech-internal surfaces.
```css
/* === CUSTOMER-SAFE MODE — hides ALL tech-internal surfaces (pay/races/roasts/comp) === */
/* Trigger: body.customer-mode (set by enterCustomerMode JS). Everything tagged
   data-tech-only is hidden. Sidebar collapses. Engagement bar disappears.
   Only safe views (Estimate / Invoice / Receipt / Finance / Forms / Customer details)
   remain accessible. Exit requires PIN. */
body.customer-mode [data-tech-only],
body.customer-mode .sidebar,
body.customer-mode #engagementBar,
body.customer-mode #winsFeed,
body.customer-mode .ask-hank-fab,
body.customer-mode .demo-bar { display: none !important; }

body.customer-mode .main { max-width: 100%; padding: 30px 40px; }
body.customer-mode .layout { display: block; }
body.customer-mode .topbar { background: linear-gradient(90deg, #1b5e20 0%, #2e7d32 50%, #1b5e20 100%) !important; }

.cust-mode-banner {
  display: none; position: fixed; top: 0; left: 0; right: 0; z-index: 950;
  background: linear-gradient(135deg, #4caf50 0%, #1b5e20 100%); color: white;
  padding: 10px 20px; text-align: center; font-size: 13px; font-weight: 700;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
body.customer-mode .cust-mode-banner { display: flex; align-items: center; justify-content: space-between; }
body.customer-mode #view-app { padding-top: 50px; }
```
**Toggle button (1542–1545, topbar):** `onclick="enterCustomerMode()"`, green gradient `#4caf50→#1b5e20`, white text, "🔒 Hand to Customer".
**Banner + exit (6480–6484):** `.cust-mode-banner` "🔒 Customer view active · Jane Smith · 104812 · 📞 calls recorded…" + exit button `onclick="exitCustomerMode()"`.
**Exit-PIN modal `#custPinModal` (6486–6499):** `display:none; position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:9999`. Inner card `--surface-1` + `2px solid --amber`. `#custPinInput` (type=password, maxlength=4). Buttons: "Stay in customer mode" (hides modal) + "🔓 Unlock" `onclick="confirmCustPin()"` (amber gradient, `color:#1a1a1a`). Footer: "Demo: any 4 digits work · Production: tech's PIN from Tech Sheet Setup tab".

**Colors:** tokens `--surface-0/1/2`, `--border`, `--amber`, `--amber-bright`, `--amber-deep`, `--fg-1`, `--fg-3`; brand green `#4caf50`/`#1b5e20`/`#2e7d32`. **⚠ Flag:** `#a5d6a7` (lines 1538–1539, ON-SITE chip text). Unlock button `#1a1a1a` is dark-on-amber (OK).

### 2. JS (lines 11490–11515, verbatim)
```js
function enterCustomerMode() {
  document.body.classList.add('customer-mode');
  navTo('estimate');
  setTimeout(function () {
    alert('🔒 Customer mode ON\n\n• Pay tab hidden\n• Vegas / Races / leaderboard hidden\n• Hank Roast hidden\n• Engagement bar (money/rank/streak) hidden\n• Sidebar collapsed\n• Only commerce surfaces visible (Estimate / Invoice / Payment / Receipt / Financing / Forms)\n\nHand the iPad to Jane.\nTo exit, tap the green banner at the top → enter your PIN.');
  }, 100);
}
function exitCustomerMode() {
  document.getElementById('custPinModal').style.display = 'flex';
  setTimeout(function () { document.getElementById('custPinInput').focus(); }, 100);
}
function confirmCustPin() {
  var pin = document.getElementById('custPinInput').value;
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { alert('⚠ Enter a 4-digit PIN'); return; }
  // In production: validate against Tech Sheet Setup PIN. Demo: any 4 digits work.
  document.body.classList.remove('customer-mode');
  document.getElementById('custPinModal').style.display = 'none';
  document.getElementById('custPinInput').value = '';
  alert('🔓 Tech view restored\n\nWelcome back, Matt. All your stuff is visible again.\n\n(In production: PIN validated against Tech Sheet Setup. PIN attempts logged to _DB_CustomerModeAudit. 3 wrong attempts emails Devin.)');
}
```

### 3. SERVER CALLS
**None.** PIN mocked (any 4 digits). Production intent (comments): validate vs Tech Sheet Setup PIN, log to `_DB_CustomerModeAudit`, 3 wrong attempts emails Devin.

### 4. TRIGGER / BEHAVIOR
- **Activates:** tap "🔒 Hand to Customer" → `enterCustomerMode()` adds `body.customer-mode`, auto-navigates to Estimate, alert.
- **Hides:** all `[data-tech-only]`, `.sidebar`, `#engagementBar`, `#winsFeed`, `.ask-hank-fab`, `.demo-bar`; single-column full-width main; green topbar; shows green `.cust-mode-banner`.
- **Leaves visible:** Estimate / Invoice / Payment / Receipt / Financing / Forms + customer details.
- **Dismissed:** banner "🔓 Tech: enter PIN to exit" → `exitCustomerMode()` → `#custPinModal` → any 4 digits → `confirmCustPin()` removes class. "Stay in customer mode" just hides modal.
- **Related modes (same `[data-tech-only]` tagging):** `body.cb-helper` (388–389) hides `[data-tech-only]` + `#nav-estimates`; `body.onsite-quiet` (402–408) softer auto-mode hides `#winsFeed`, `[data-onsite-hide]`, `#engagementBar`, dims Ask Hank.

---

## B) CONFIDENTIAL MODE — `#confidentialNote` (per-job advisory banner)

### 1. MARKUP (lines 7065–7071, inside job-overview drawer)
```html
<!-- 🔒 CONFIDENTIAL PROPERTY · v63 · Devin: gov/public housing — signed agreement
     not to discuss a resident's info with other residents. Shows only when the job
     is flagged confidential (cbApplyConfidential). AI also redacts health from transcripts. -->
<div id="confidentialNote" style="display:none;background:rgba(156,100,244,0.10);border:1px solid #9c64f4;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--fg-1);line-height:1.5;">
  <strong style="color:#c8a8ff;">🔒 Confidential property (gov / public housing)</strong><br>
  Do <strong>not</strong> discuss any resident's information — health, situation, or otherwise — with other residents or anyone off the job. Per CB's signed housing-authority privacy agreement. Hank auto-redacts anything medical the customer mentions.
</div>
```
**Colors:** purple — bg `rgba(156,100,244,0.10)`, border `#9c64f4`, body `--fg-1`. **⚠ Flag:** `color:#c8a8ff` heading — hardcoded light-purple fg (contrast OK, not tokenized).

### 2. JS (lines 9837–9841, verbatim)
```js
function cbApplyConfidential() {
  var el = document.getElementById('confidentialNote');
  if (el) el.style.display = window.cbActiveConfidential ? 'block' : 'none';
}
```
Wiring (9593, on job open): `try { cbApplyConfidential(); } catch (_) {}` (alongside `cbApplyGasGateVisibility()`).

### 3. SERVER CALLS
**None.** Visibility driven by per-job flag `window.cbActiveConfidential`.

### 4. TRIGGER / BEHAVIOR
- **Activates** automatically on job open when `window.cbActiveConfidential` truthy → banner `block`.
- NOT a screen-wide overlay — a single advisory banner (don't discuss resident health/situation; Hank auto-redacts medical server-side). No layout change, no PIN, no dismiss control; disappears when the active job isn't confidential.
- **vs Customer Mode:** Customer Mode = full lockdown overlay (hides pay/races/roasts, PIN to exit, hand-over). Confidential = passive per-job compliance banner only.

---

## C) IDLE RE-AUTH LOCK — `#idleLockOverlay`

### 1. MARKUP (lines 4069–4085)
```html
<!-- 🔒 IDLE AUTO-LOCK · Devin: "if someone leaves their iPad open at a customer's
     house and they get nosey." No movement for the idle window → this lock screen
     drops over everything. Resets on any touch. Unlock = Face ID / PIN. -->
<div id="idleLockOverlay" style="display:none;position:fixed;inset:0;z-index:100000;background:linear-gradient(160deg,#0e1116 0%, #1a1206 100%);flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;">
  <div style="font-size:58px;">🔒</div>
  <div style="font-size:22px;font-weight:800;color:var(--amber);margin-top:10px;">Locked — iPad went idle</div>
  <div style="font-size:12px;color:var(--fg-1);margin:8px 0 3px;max-width:340px;">CB auto-locked it so no one can go through it while you stepped away.</div>
  <div style="font-size:11px;color:var(--fg-3);margin-bottom:22px;">Matt Shepard · device CB-IPAD-014 · all data stays encrypted</div>
  <button onclick="cbUnlockIdle()" style="background:linear-gradient(135deg,#f57c00,#e65100);color:#fff;border:none;padding:14px 30px;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 16px rgba(245,124,0,0.45);">🙂 Face ID to unlock</button>
  <div style="font-size:11px;color:var(--fg-3);margin-top:16px;">— or tap the dots to enter PIN —</div>
  <div onclick="cbUnlockIdle()" style="display:flex;gap:11px;margin-top:10px;cursor:pointer;">
    <span style="width:15px;height:15px;border-radius:50%;background:var(--amber);"></span>
    <span style="width:15px;height:15px;border-radius:50%;background:var(--amber);"></span>
    <span style="width:15px;height:15px;border-radius:50%;background:var(--amber);"></span>
    <span style="width:15px;height:15px;border-radius:50%;background:var(--surface-3);border:1px solid var(--amber-dim);"></span>
  </div>
</div>
```
**Settings row (6236–6237):** `<div class="settings-row"><span class="lbl">Auto-lock</span><span class="v">After 2 min idle · <span onclick="cbLockNow()" style="color:var(--amber);cursor:pointer;text-decoration:underline;">🔒 Lock now (test)</span></span></div>` (also 6238: "Session Timeout · 8 hr · re-auth after work shift").
**Colors:** overlay bg `#0e1116→#1a1206`; headline `--amber`; button `#f57c00→#e65100` `#fff`; dots `--amber`/`--surface-3`+`--amber-dim`. No dark-on-dark text flags.

### 2. JS (lines 12727–12746, verbatim)
```js
/* === IDLE AUTO-LOCK · security (Devin) === */
var _cbIdleMs = 120000;            // 2 min idle → lock (demo value; Settings drives prod)
var _cbIdleTimer = null;
function cbArmIdle() { if (_cbIdleTimer) { clearTimeout(_cbIdleTimer); } _cbIdleTimer = setTimeout(cbLockNow, _cbIdleMs); }
function cbLockNow() { var o = document.getElementById('idleLockOverlay'); if (o) { o.style.display = 'flex'; } }
function cbUnlockIdle() { var o = document.getElementById('idleLockOverlay'); if (o) { o.style.display = 'none'; } cbArmIdle(); }
(function () {
  var reset = function () {
    var o = document.getElementById('idleLockOverlay');
    if (o && o.style.display === 'flex') { return; }   // already locked — ignore until unlocked
    cbArmIdle();
  };
  ['mousedown', 'touchstart', 'keydown', 'scroll', 'mousemove', 'click'].forEach(function (ev) {
    document.addEventListener(ev, reset, { passive: true });
  });
  cbArmIdle();
})();
```

### 3. SERVER CALLS
**None.** Client-side timer; unlock mocked (button + dots both call `cbUnlockIdle()`; no real Face ID/PIN).

### 4. TRIGGER / BEHAVIOR
- **Activates:** IIFE registers `mousedown/touchstart/keydown/scroll/mousemove/click` → `cbArmIdle()` (and on load). After 2 min no events → `cbLockNow()` shows `#idleLockOverlay` (`z-index:100000`, above gas hard-stop).
- Once locked, `reset` early-returns while overlay shows — touches do NOT re-arm; must explicitly unlock.
- **Manual test:** Settings → "🔒 Lock now (test)" → `cbLockNow()`.
- **Dismissed:** "🙂 Face ID to unlock" OR tapping PIN dots → `cbUnlockIdle()` hides overlay + re-arms.

---

## D) GAS-GATE — `cbEquip_gasMismatchCheck` (water-heater wrong-fuel block)

### 1. MARKUP
**Drawer trigger card `#gasGateCard` (7124–7137):** hidden by default, gradient `#3a2410→--surface-1`, `2px solid --yellow-bright`. Header "Gas Type Check — required" + `#gasGateStatus` + `#gasGateBadge` ("NOT VERIFIED"). Button `onclick="openGasCheck()"` "⛽ Run Gas Type Check" (`#f57c00→#e65100`, `#fff`).
**Verification modal `#gasCheckModal` (6741–6791):** Step 1 unit gas type (NAT/LP/ELECTRIC, `.gasUnitBtn` `data-unit`), Step 2 property supply (NG/LP, `.gasSupplyBtn` `data-supply`), AI-photo-verify button, disabled run button `#gasRunBtn`, inline-Hank NG-vs-LP explainer. Result-clear block `#gasResultClear` (6782–6788): green `rgba(46,125,50,0.12)` + `--green-bright`, "Clear to install", `#gasClearMsg`, "Got it — proceed" `onclick="gasAcceptClear()"`.
**Full-screen HARD STOP `#gasHardStop` (6793–6801):**
```html
<div id="gasHardStop" style="display:none;position:fixed;inset:0;z-index:10001;background:#7f0000;color:#fff;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center;">
  <div style="font-size:72px;line-height:1;animation:turdShake 0.8s ease-in-out infinite;">⛔</div>
  <div style="font-size:30px;font-weight:900;margin-top:14px;letter-spacing:0.5px;">WRONG GAS TYPE</div>
  <div style="font-size:22px;font-weight:800;margin-top:4px;">DO NOT INSTALL</div>
  <div id="gasStopMsg" style="font-size:15px;max-width:460px;margin-top:16px;line-height:1.5;opacity:0.95;"></div>
  <div style="font-size:12px;margin-top:18px;opacity:0.85;">📡 Your manager has been alerted. This is logged.</div>
  <button onclick="gasAckStop()" style="margin-top:24px;background:#fff;color:#7f0000;border:none;padding:14px 26px;border-radius:10px;font-size:15px;font-weight:900;cursor:pointer;">I understand — I will NOT install this unit</button>
</div>
```
**Colors:** card `#3a2410→--surface-1`, `--yellow-bright`, badge `rgba(255,193,7,0.15)`, run btn `#f57c00→#e65100` `#fff`; clear `rgba(46,125,50,0.12)` + `--green-bright`, accept btn `#4caf50→#1b5e20` `#fff`; hard-stop solid `#7f0000` + `#fff`, ack btn white/`#7f0000`; modal selected state `--amber` border + `rgba(255,179,0,0.12)`. **⚠ Flags:** Hank explainer heading `#c8a8ff` (6768) + photo-verify button `#64b5f6` (6761) — hardcoded light fg on dark (OK contrast, not tokenized).

### 2. JS — visibility helper 9845–9851; flow 10801–10917 (key fns verbatim)
```js
function cbApplyGasGateVisibility() {                              // 9845
  var card = document.getElementById('gasGateCard');
  if (!card) return;
  var t = String(window.cbActiveJobType || 'drain').toLowerCase();
  var isGasWH = /water\s*heater|wh\b/.test(t) && /gas|nat|lp|propane|install|replace/.test(t) && !/electric/.test(t);
  card.style.display = isGasWH ? 'block' : 'none';
}
```
Module state (9835): `var _gasUnit = null, _gasSupply = null, _gasVerified = false;`
- `openGasCheck()` 10801, `closeGasCheck()`, `gasSelectUnit(u)` 10812, `gasSelectSupply(s)` 10821, `_gasUpdateRunBtn()` 10830 (enables `#gasRunBtn` only when both chosen), `gasPhotoVerify()` 10842 (mock alert; backend `cbEquip_scanDataPlate_`).
- `gasRunCheck()` 10847 — builds args, calls server (or local mirror in preview):
```js
function gasRunCheck() {
  if (!_gasUnit || !_gasSupply) return;
  var p = window.cbTechData || {};
  var args = { unitGasType: _gasUnit, supplyFuel: _gasSupply, jobId: (window.cbActiveJobId || '104812'), tech: p.name || '', model: (window.cbActiveModel || '') };
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function (v) { _gasApplyVerdict(v || _gasLocalVerdict()); })
      .withFailureHandler(function () { _gasApplyVerdict(_gasLocalVerdict()); })
      .cbEquip_gasMismatchCheck(args);
  } else { _gasApplyVerdict(_gasLocalVerdict()); }
}
```
- `_gasLocalVerdict()` 10867 — preview mirror; returns `{ ok:true, safe, stop:!safe, message }`. ELECTRIC always safe; otherwise safe iff `unitFuel === _gasSupply`.
- `_gasApplyVerdict(v)` 10877 — `v.safe`→show `#gasResultClear`; else close modal + show `#gasHardStop` + `_cbLogProtectionEvent('GAS_MISMATCH_STOP')`.
- `gasAcceptClear()` 10890 — sets `_gasVerified=true`, persists via `cbEquip_setPropertyFuel`, flips badge "✓ VERIFIED" green.
- `gasAckStop()` 10910 — hides hard-stop, badge "⛔ WRONG UNIT" red, "get the correct unit, then re-run".

### 3. SERVER CALLS
| client fn | server fn | args | success shape |
|---|---|---|---|
| gasRunCheck (10860) | `cbEquip_gasMismatchCheck` | `{ unitGasType('NAT'\|'LP'\|'ELECTRIC'), supplyFuel('NG'\|'LP'), jobId, tech, model }` | `{ ok:true, safe:bool, stop:bool, message:string }` — falls back to `_gasLocalVerdict()` on null/failure |
| gasAcceptClear (10897) | `cbEquip_setPropertyFuel` | `(customerPhone, address, _gasSupply, email)` from `window.cbActiveCustomerPhone/cbActiveAddress` | fire-and-forget, no documented return |
| (referenced only) | `cbEquip_scanDataPlate_` | — | AI plate-photo read; mock alert in this file |

`_cbLogProtectionEvent('GAS_MISMATCH_STOP')` (10886) is a client-side logger (guarded `&&`), not `google.script.run`.

### 4. TRIGGER / BEHAVIOR
- **Visibility:** `cbApplyGasGateVisibility()` (job open, 9592) shows `#gasGateCard` ONLY for gas water-heater install/replace (regex above). Drain/electric → hidden.
- **Flow:** "⛽ Run Gas Type Check" → `openGasCheck()` → pick unit type + property supply → run button enabled only when both → "⛽ Verify gas type" → `gasRunCheck()` → server or local mirror.
- **SAFE:** green "Clear to install" → "Got it — proceed" persists fuel + flips badge "✓ VERIFIED".
- **MISMATCH (the block):** full-screen `#gasHardStop` (red, z-index 10001) — "WRONG GAS TYPE / DO NOT INSTALL", manager-alerted + logged. This is the water-heater wrong-fuel install block (NAT-on-LP / LP-on-NAT). ELECTRIC always passes.
- **Dismissed:** hard-stop "I understand…" → `gasAckStop()` → badge "⛔ WRONG UNIT", prompt to re-run. Modal otherwise via `closeGasCheck()`.

---

# PART 4 — PORT NOTES (cross-cutting)

- **Server functions referenced across all panes** (`google.script.run`): `cbTechIpad_closeGate`, `cbDur_record`, `cbVideo_initUpload`, `cbVideo_appendChunk`, `cbVideo_finishUpload`, `cbVideo_abortUpload`, `cbDispatchBoard_uploadJobPhoto`, `cbFleet_logVan`, `cbFleet_readOdometer`, `cbFleet_getDoc`, `cbFleet_readReceipt`, `cbFleet_logService`, `cbFleet_vanHealth`, `cbDispatchBoard_getMyReferralCode`, `cbMoist_setStandard`, `cbMoist_points`, `cbMoist_addReading`, `cbMoist_aiCheck`, `cbEquip_gasMismatchCheck`, `cbEquip_setPropertyFuel`, `cbTechIpad_selfIssue` (shop). For the Next.js port, each becomes a same-origin session-gated `app/api/*/route.js` calling Supabase.
- **Mockup-only / unwired** (described in copy, no server call — implement fresh in port): PO vendor attach (`_DB_…` PO record + internal office flag), comms text-send (Twilio A2P → `_DB_CustomerComms`), finance text-link (Wisetack → `finance_status_callback` → `_DB_FinanceApps`), receipt email/text/print sends, form sign-and-archive (`Drive /CB_LegalForms/<job>/` → `legal@clogbusterzplumbing.com`), customer-mode PIN audit (`_DB_CustomerModeAudit`), idle-lock Face ID/PIN, drycalc send-to-manager.
- **Invoice lock = functional, not visual.** Never disable the Submit button in the port to match behavior — fire the gate on click (`cbTryCloseJob` → `cbCloseBlockers_` over `CB_GATE.requiredForms`/`requiredVideos`). After blockers clear, run the server close-gate (`cbTechIpad_closeGate`, fails open on infra error).
- **Hardcoded-hex-on-dark to FIX in the port** (contrast / detokenize): comms amber-bubble timestamps `#5a4a1a` on `--amber-deep #3A1A0A` (3610/3626) and olive `#6b8e63` on dark-green (3635); receipt `#a5d6a7`/`#4caf50`/`#c8a8ff`; videos `#ffcdd2`/`#ffe5e5`/`#64b5f6`/`#bbb`/`#888`; van `#c8a8ff`/`#64b5f6`; mkt `#a5d6a7`/`#ff8a65`; confidential/gas `#c8a8ff`/`#64b5f6`. (Many are light-on-dark and only need tokenizing; the comms timestamps are the genuine low-contrast offenders.)
- **Markup artifact:** `pane-videos` lines 3940 & 3968 contain literal `required="required"` in visible copy — strip in the port.
- **FloodBusterz drycalc formula is load-bearing — port verbatim** (`CB_IICRC` constants + `cbDry_calcRoom_`): movers = 1 + ceil(floorSqFt / AREA_PER_MOVER[class]) + corners; PPD = cubicFt × PINT_FACTOR[class] / 1000; LGR units = ceil(totalPPD / 100).
