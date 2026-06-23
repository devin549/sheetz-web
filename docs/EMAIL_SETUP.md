# Email setup (Resend) — go-live checklist

Everything in the code is ready. Email goes live the moment these **account steps** are done
(only Devin can do them — your Resend account, your DNS, your Vercel env vars). This powers:
**📣 Mass Email**, **✉️ Email to customer** (statements), and the **📭 open tracking** + **📊 usage counter**.

---

## 1. Resend account + verify your domain  *(required to email customers)*
1. Sign up at **https://resend.com** (free).
2. **Domains → Add Domain →** `clogbusterzplumbing.com`.
3. Resend shows ~3 DNS records (SPF, DKIM, DMARC). Add them wherever `clogbusterzplumbing.com`
   DNS is managed (GoDaddy / Cloudflare / etc.).
4. Wait for the domain to flip to **Verified** (minutes–few hours).

> ⚠️ Until the domain is verified, Resend only lets you email **your own address** (test mode).
> Verifying the domain is what unlocks sending to real customers from `Accounting@clogbusterzplumbing.com`.

## 2. Create an API key
5. Resend → **API Keys → Create** → copy it (starts with `re_…`). Keep it secret.

## 3. Add env vars in Vercel  (sheetz-web → Settings → Environment Variables)
| Name | Value | Why |
|---|---|---|
| `EMAIL_API_KEY` | `re_…` | the Resend key (sending) |
| `EMAIL_FROM` | `Clog Busterz Plumbing Services <Accounting@clogbusterzplumbing.com>` | the FROM address customers see |
| `APP_URL` | your production URL (e.g. `https://sheetz-web-git-main-devin-tackett-s-projects.vercel.app`) | makes the logo + open-tracking pixel load in emails |

Optional (set after you upgrade your Resend plan):
| `EMAIL_DAILY_LIMIT` | e.g. `1000` | counter's daily cap |
| `EMAIL_MONTHLY_LIMIT` | e.g. `50000` | counter's monthly cap |

Then **redeploy** (env changes need a fresh deploy to take effect).

## 4. Run the email migrations (Supabase → SQL Editor)
Run the bundled **`supabase/RUN_ALL_PENDING_14_15_16.sql`** (it's idempotent — safe to re-run). It backs:
- `email_campaigns` + `email_sends` (14) — campaigns + per-recipient audit
- `email_sends.opened_at…` (18) — open tracking
- `email_events` (21) — the usage counter

## 5. Test it
- **Mass Email** → make a tiny draft → **✉️ Test to me** → check your inbox.
- Or open a customer **Statement** → **✉️ Email to customer** (send one to yourself first).

---

## Limits & cost (Resend)
- **Free:** 100 emails/day, 3,000/month — fine for statements + collections drips.
- A full blast to the ~900 past-due list in one day needs the **paid plan (~$20/mo, 50k/mo)**.
- The **📊 Email usage** bars on the Mass Email page track today/month vs the cap and show an
  **upgrade alert at 90%** so sends never silently fail. After upgrading, bump the
  `EMAIL_DAILY_LIMIT` / `EMAIL_MONTHLY_LIMIT` env vars to the new numbers.

## How sending behaves (already built)
- **Guardrail:** mass email is draft → preview/pick recipients → an **approver** releases it. Never a one-click blast.
- **Robustness:** `sendOne` retries on rate-limit (429) / 5xx with backoff; the campaign loop paces ~8/sec.
- **Tracking:** every send logs to `email_events` (counter) and, for campaigns, `email_sends` (opens).
- **`do_not_mail`** customers + empty/dupe emails are always skipped.

## Code map
- `lib/email.js` — Resend wrapper (`sendOne`, `renderEmailHtml`, `EMAIL_LIMITS`, `appBaseUrl`)
- `lib/company.js` — FROM name + return address + logo used on docs/emails
- `app/(main)/campaigns/*` — Mass Email (compose/approve/send + usage counter)
- `app/api/track/open/route.js` — open-tracking pixel endpoint
- `app/(main)/past-due/actions.js` — `emailStatement` (1:1 statement send)
