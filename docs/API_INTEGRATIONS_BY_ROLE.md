# API & AI integrations by position — migration checklist

Parity is **not just the screens** — every position in the old Sheets ecosystem had APIs and AI
agents firing behind it. This is the list we re-wire into the web app (Vercel env vars +
server-side route handlers), so nothing gets lost going from HTML → web. Status updated as ported.

> Keys live in **Vercel → Settings → Environment Variables** (server-side only — never
> `NEXT_PUBLIC_` for anything secret). Each integration gets a server route in `app/api/...`
> so the browser never sees the key. RLS + service_role pattern already in place.

## Shared / core (all roles)
| Integration | Use | Env var | Status |
|---|---|---|---|
| Anthropic Claude | every AI agent (drafts, triage, summaries) | `ANTHROPIC_API_KEY` | ⬜ key needed |
| Supabase | DB + auth + storage (the new spine) | set ✅ | ✅ live |
| Vision OCR (Google/Anthropic) | receipts, odometer, data-plate, docs | `VISION_API_KEY` | ⬜ key needed |
| Discord webhook | "Captain Hook" alerts → #sheetz | `DISCORD_WEBHOOK_URL` | ⬜ port |

## 👑 Owner (Devin) — everything, plus intel
| Integration | Use | Env var | Status |
|---|---|---|---|
| SerpAPI ($75/mo, paid) | competitive rank scan, keyword gaps, Marketing Domination report | `SERPAPI_KEY` | ⬜ port |
| Google Places | review tracking, GBP presence | `GOOGLE_PLACES_KEY` | ⬜ port |
| BrightLocal (paid, manual tier) | local rank tracking (no API at this tier) | n/a | manual |
| Call Intelligence (Deepgram + Claude) | listen to Clarity calls, summarize, PCI redact | `DEEPGRAM_API_KEY` | ⬜ port |
| Warranty AI ("Pete") | 16-provider warranty claim pipeline + Vapi autofire | `VAPI_API_KEY` | ⬜ port |
| System Health audit | self-audit pipeline, review watcher, LSA alerts | (Claude) | ⬜ port |

## 🏢 Office (CSR / Dispatch / OM / Accounting)
| Integration | Use | Env var | Status |
|---|---|---|---|
| Accounting AI | receipt OCR + classifier + Job#/Tech match, doc-fraud gate | `VISION_API_KEY` + Claude | ⬜ port |
| Collections AI | AR cascade, email/SMS dunning, lawyer package, AI voice (Vapi/Bland) | `VAPI_API_KEY` | ⬜ port |
| Customer SMS responder ("Hank") | draft-mode replies, Tracey approval gate | `TWILIO_*` + Claude | ⬜ port |
| Booking / triage co-pilot | adaptive job-type triage, Book-first-available | (Claude) | ⬜ port |
| Twilio (A2P 10DLC registered) | customer SMS (confirmations, dunning) | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | ⬜ port |
| Stripe | payment links + Terminal reader (4% card fee) | `STRIPE_SECRET_KEY` | ⬜ port |
| ServiceTitan dev API | optional middleware/sync during migration window | `ST_CLIENT_ID` / `ST_CLIENT_SECRET` | ⬜ optional |
| dispatch.me | lead intake (official API pending; email-parse fallback) | tbd | ⬜ pending |

## 🔧 Tech (field iPad)
| Integration | Use | Env var | Status |
|---|---|---|---|
| Vision OCR | receipt photo, odometer, water-heater data-plate (fuel-type guard) | `VISION_API_KEY` | ⬜ port |
| Job triage co-pilot | on-site adaptive playbooks (water heater → gas/electric/age/basement) | (Claude) | ⬜ port |
| Stripe collect | take payment in the field (reader / text link) | `STRIPE_SECRET_KEY` | ⬜ port |
| Shop self-issue | after-hours parts/tool checkout → review queue | Supabase | 🟡 partial (read-only) |

## Rules carried over (don't break these)
- **No auto-send to external parties** without an internal approver (Ashley/Tracey/Devin) + audit
  trail. Customer/CPA/provider/lawyer outbound stays gated. (5/12 zero-value payroll incident.)
- **Vision OCR is real / wired** on Accounting today — don't rebuild, port the calling pattern.
- **Endpoints must be reachable** — in the web app that means a real `app/api/<x>/route.js`, keys
  server-side only.
- Keys Devin still owes: `ANTHROPIC_API_KEY`, `VISION_API_KEY` are the two that unblock the most.
