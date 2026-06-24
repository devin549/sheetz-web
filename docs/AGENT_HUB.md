# Sheetz Agent Hub

Read-only specialist agents that inspect Supabase data and report into the OpenAI collaborator rollup.

## Route

`POST /api/ai/agent-hub`

Headers:

```http
x-agent-secret: <AGENT_HUB_SECRET>
```

Fallback: if `AGENT_HUB_SECRET` is not set, the route accepts `COLLABORATOR_AUDIT_SECRET`.
It also accepts `x-audit-secret` for compatibility with the existing collaborator route.

Body:

```json
{
  "agents": ["accounting-money", "dispatch-ops", "price-margin"],
  "collaborator": true
}
```

## Agents

- `accounting-money`: uses the Accounting Claude key. Looks for AR, payment, payroll, fee, receipt, and cash-custody risk.
- `dispatch-ops`: uses the GM Claude key. Looks for late/stale jobs, helper needs, ETA gaps, capacity, and board workflow issues.
- `price-margin`: uses the Owner Claude key. Looks for price-book gaps, vendor price changes, repeated parts/tools, margin leaks, and owner-approval price changes.

After the specialist agents run, the route sends their reports to the OpenAI collaborator for one owner-ready rollup.

## Env Vars

Required:

```bash
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
OPENAI_API_KEY=
COLLABORATOR_AUDIT_SECRET=
```

Recommended:

```bash
AGENT_HUB_SECRET=
ANTHROPIC_KEY_OWNER=
ANTHROPIC_KEY_GM=
ANTHROPIC_KEY_ACCOUNTING=
```

Fallbacks:

- If `AGENT_HUB_SECRET` is missing, `COLLABORATOR_AUDIT_SECRET` protects the route.
- If a role-specific Claude key is missing, `lib/anthropic.js` falls back to `ANTHROPIC_KEY_OWNER`, then `ANTHROPIC_API_KEY`.

## PowerShell Test

```powershell
$secret = "YOUR_SECRET"
$body = @{
  agents = @("accounting-money", "dispatch-ops", "price-margin")
  collaborator = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Method POST `
  -Uri "https://YOUR-VERCEL-DOMAIN/api/ai/agent-hub" `
  -Headers @{ "x-agent-secret" = $secret } `
  -ContentType "application/json" `
  -Body $body
```

## Safety

- Agents are read-only.
- They never send customer messages, approve payroll, change prices, mark invoices paid, or move jobs.
- Their reports are recommendations only.
- Customer-facing, payroll, payment, and price-book actions still need manager approval.
