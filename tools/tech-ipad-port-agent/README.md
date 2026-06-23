# Tech iPad Port Agent

Read-only migration helper for copying the live Apps Script Tech iPad into the Sheetz web app.

It scans exported legacy source, compares it to the current Next/Supabase app, and writes a migration
report with feature status, source inventory, data dependencies, side effects, and recommended build
order.

## Run

```bash
npm run agent:tech-ipad
```

Report output:

```text
.audits/tech-ipad-port-agent-report.md
```

## Add Legacy Source

Export the Apps Script project files into:

```text
legacy/tech-ipad/
```

Useful files include:

```text
CB_Dispatch_TechIpad*.gs
CB_Dispatch_TechIpad*.html
CB_Dispatch_Helper*.gs
CB_Dispatch_Tools*.gs
CB_Dispatch_WorkOrder*.gs
CB_Dispatch_HelpRequest*.gs
CB_Dispatch_VideoUpload*.gs
```

Or point at any export folder:

```bash
TECH_IPAD_SOURCE_DIR=C:/path/to/Dispatch_Sheet npm run agent:tech-ipad
```

## What It Looks For

- Tech iPad tabs and screens
- Apps Script functions
- Sheet/data dependencies
- Spreadsheet writes, Drive uploads, email sends, HTTP calls, triggers
- Current web parity under `app/`, `lib/`, `supabase/`, and `docs/`
- Recommended P0/P1 build order

## Safety

The agent is read-only. It does not submit forms, call customers, send messages, write Supabase rows,
or change source files outside the generated local report.
