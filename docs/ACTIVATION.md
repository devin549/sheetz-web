# Activation — turn the platform on with real data + access

Everything is built and deployed. These steps light it up. Do them once, in order.

## 1. Database — one paste
Supabase → SQL Editor → New query:
- **`supabase/RUN_PENDING_AR_TASKS_LEADS.sql`** → creates the tables behind Payment Ledger,
  Tasks, Web Leads, Receipts, Open Estimates, Payroll, Doc Fraud, Cash Custody, and Goals
  (migrations 12, 27–34). Idempotent, additive, safe to re-run.

(The roles/QA/photo tables — `RUN_ALL_ROLES_QA.sql`, migrations 23–26 — were already run.)

## 2. Vercel env (Production scope)
Vercel → project → Settings → Environment Variables → add for **Production**, then redeploy:
- `SUPABASE_SERVICE_ROLE_KEY` — required (most screens read through it). Confirm it's on Production, not just Preview.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — required (login).
- `ANTHROPIC_KEY_OWNER` — turns on **Ask the Board**, **Receipt AI-read**, **Hank**. (Optional per-role keys: `ANTHROPIC_KEY_GM/OFFICE/ACCOUNTING/…`.)
- `WEB_LEADS_INTAKE_SECRET` — optional; secures the public `/api/leads` endpoint.

## 3. Access & roles — the model is "one login → one role → one scope"
You are seeded as **owner** (full access). For everyone else, on **/team**:
1. **Add a hire** — name + email + temp password + **role**. This writes their profile (role + scope).
2. **Link techs** — for each person whose role is **Tech** or **Helper**, use the **"link to tech"**
   dropdown to connect their login to their roster row. Once linked, that tech sees **only their own
   jobs** on My Day + the Job File and can't touch anyone else's.
3. **Role decides the cockpit** — the left nav, the screens, and the actions all adapt to the role
   (Owner/GM see everything; Dispatcher runs the board; FS gets QA + crew; Accounting gets money;
   Tech gets their day). Office roles also get the Board, Booking, Customers, Accounting, etc.
   Field roles get My Day. Nothing is hidden behind broken UI — items show "soon" if still porting.

Roles available: owner, gm, om, dispatcher, csr, fs (Field Supervisor), foreman, accounting, sales,
marketing, shop, tech, helper, viewer.

## 4. Lead intake
Point your website contact form at **`https://<your-production-url>/api/leads`** (JSON or
form-encoded; fields: name, phone, email, address, service, message). Add a hidden `company` field
as a bot honeypot. If you set `WEB_LEADS_INTAKE_SECRET`, send it as header `x-cb-intake-key`.
The **/web-leads** page has a copy-paste curl example. Submissions land in the Web Leads inbox →
"Book" turns one into a job on the board.

## 5. Goals (so the Game Plan measures right)
**/settings** → set your real targets (Booked $/day, Avg ticket, AR collect, etc.). The board's
**Today's Game Plan** then tracks Booked / Avg-ticket / Clear-QA against them live.

## 6. Pay rates (so Payroll computes)
**/payroll** → **Pay rates** → set each tech's pay type + commission % / hourly rate / salary.
Then "Generate draft" for a week: commission auto-fills from completed-job revenue, hours auto-fill
from the job timeline. Review → **Approve** (locks; never auto-sends — export is a separate step).

## Quick verify
- Log in as owner → you should see the full cockpit nav + the unified board (Game Plan, Fire, views).
- Open a job → Closeout Status shows.
- /receipts, /payroll, /doc-fraud, /cash-custody, /open-estimates, /tasks, /web-leads load (empty until used).
- Add a test tech on /team, link them to a roster row, log in as them → they see only their day.
