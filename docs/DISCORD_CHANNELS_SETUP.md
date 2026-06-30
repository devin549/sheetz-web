# Discord — Office/#dispatch split + Captain Hook talking back

Two things this enables: (1) operational noise routes to a separate **#dispatch** channel so the team
**#sheetz** stays human, and (2) **Captain Hook / Pipe Wrench Hank** read the team channel and reply.

The CODE is done. The rest is Vercel env + a 5-minute Discord setup. All steps below are yours (Devin) —
they need access to the Discord server settings and the Vercel dashboard.

---

## 1. Split: route operational pings to #dispatch

**What now routes to `#dispatch` instead of `#sheetz`:** en route / lunch (step-away) / need-a-hand /
rollover status pings, new jobs, new web bookings, FloodBusterz + referral leads, estimate approvals,
customer estimate sign-offs, territory checks.

**Stays in `#sheetz` (team):** meetings (@everyone) + reminders, team chat messages, on-call announcements,
the "NEW PRICEBOOK DROP" hype, and Hank / Captain Hook replies to the crew.

**To turn it on:**
1. In Discord, create a channel — e.g. `#dispatch` (or `#office`).
2. Channel → Edit → **Integrations → Webhooks → New Webhook** → name it "Captain Hook" → **Copy Webhook URL**.
3. In Vercel → Project → Settings → **Environment Variables**, add:
   - `DISCORD_OFFICE_WEBHOOK_URL` = the webhook URL from step 2  (Production + Preview)
4. Redeploy.

> Safe before you do this: until `DISCORD_OFFICE_WEBHOOK_URL` exists, those office posts fall back to the
> team `#sheetz` webhook exactly like today — nothing breaks, they just haven't moved yet.

---

## 2. Captain Hook talking back (read + reply)

A webhook can only POST. To READ #sheetz and reply, Captain Hook needs a **bot**:

1. https://discord.com/developers/applications → **New Application** → name it "Captain Hook".
2. **Bot** tab → **Reset Token** → copy it. Under **Privileged Gateway Intents**, enable
   **MESSAGE CONTENT INTENT** (required — without it the bot reads blank messages).
3. **OAuth2 → URL Generator** → scopes: `bot` → bot permissions: **Read Messages/View Channels** +
   **Read Message History** (+ **Send Messages** if you ever post via the bot instead of the webhook) →
   open the generated URL → invite the bot to your server.
4. Get the **#sheetz channel ID**: Discord → User Settings → Advanced → enable **Developer Mode**, then
   right-click `#sheetz` → **Copy Channel ID**.
5. In Vercel env, add:
   - `DISCORD_BOT_TOKEN` = the bot token (step 2)
   - `DISCORD_CHANNEL_ID` = the #sheetz channel ID (step 4)
   - `HANK_AUTOREPLY` = `on`  ← this is the switch that lets Hank actually POST his replies
6. Redeploy.

**How replies work once on:**
- **Keyword commands** (every 2 min, `/api/cron/discord-sync`): "running late", "need help", "parts run",
  "where's the <tool/part>" → instant Captain Hook answer + the matching dispatch action.
- **Everything else** (every 10 min, `/api/cron/hank`): Pipe Wrench Hank reads open questions and replies
  conversationally using real CB data (crew availability, tool/part location, today's jobs). He stays
  **silent on banter / reactions / small talk** by design. A message a keyword already answered is marked
  seen so Hank won't double-reply.

> Want to watch before it speaks? Leave `HANK_AUTOREPLY` unset/off — Hank still reads and logs what he
> *would* say (visible in the Comms Desk) but won't post. Flip it to `on` when you're happy.

---

## Env var summary

| Var | Purpose | Required for |
|-----|---------|--------------|
| `DISCORD_WEBHOOK_URL` | #sheetz (team) poster | already set |
| `DISCORD_OFFICE_WEBHOOK_URL` | #dispatch (office) poster | the channel split |
| `DISCORD_BOT_TOKEN` | read #sheetz | talking back |
| `DISCORD_CHANNEL_ID` | which channel to read (#sheetz) | talking back |
| `HANK_AUTOREPLY` = `on` | let Hank actually post | talking back |
