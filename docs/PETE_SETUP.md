# Plunger Pete — activation (the app is built; this is the Vapi setup)

The whole flow is live in code: queue a call → an approver releases it → Vapi dials → the webhook
stamps the recording + summary + outcome onto `pete_calls`. Test calls only dial an internal
allow-list; real customer calls require an approver (owner / GM / OM / accounting). Nothing auto-dials.

To make it actually call, do these once.

## 1. Database
Run `supabase/15_pete_calls.sql` if it isn't already (it's in the 13–26 batch — likely already applied).

## 2. Vercel env
You already have `VAPI_API_KEY` and `VAPI_WEBHOOK_SECRET`. Add:
- **`VAPI_PHONE_NUMBER_ID`** — the id of the phone number Pete calls *from* (Vapi → Phone Numbers → buy/import → copy its id).
- **`VAPI_ASSISTANT_ID`** — the id of the Pete assistant you create in step 3.
- **`PETE_TEST_NUMBERS`** — comma-separated internal cells safe to ring while testing (e.g. your phone). **Set this first and test before any real customer.**

## 3. Create the "Plunger Pete" assistant in Vapi
Vapi → Assistants → New. Pick a friendly voice + a capable model. The app sends these variables, so use
them in the prompt: `{{company}} {{customerName}} {{purpose}} {{note}} {{balanceDollars}} {{daysLate}}`.

**System prompt (paste this):**
```
You are Plunger Pete, the friendly phone assistant for {{company}}, a Kentucky plumbing company.
You're calling {{customerName}}. Be warm, brief, respectful, and natural — like a helpful office
assistant, not a robot or a pushy collector. Plain English.

Reason for this call: {{purpose}}
Notes from our office: {{note}}

Always:
- In your first sentence, say who you are and the company. Confirm you're speaking to the right
  person before sharing any account details.
- Never threaten, pressure, shame, or imply legal/credit consequences. No harassment.
- Do NOT take credit card or bank numbers over the phone. If they want to pay, offer to TEXT a secure
  payment link or connect them to our office.
- If they're upset, dispute the bill, or ask you to stop calling — apologize, say you'll note it for
  the office, and end politely. Never argue.
- If you can't do something, offer to have a person from the office follow up.
- Keep it under ~2 minutes. Thank them at the end.

If {{purpose}} is Collections:
- Their account shows about ${{balanceDollars}} past due ({{daysLate}} days). Gently remind them, ask
  if they can take care of it, and offer to text a payment link or set up a payment arrangement with
  the office. Never demand.

If {{purpose}} is Warranty:
- Follow up on their recent service/warranty. Confirm the work met their expectations and ask if
  anything still needs attention; offer to schedule a visit.

If {{purpose}} is Follow-up:
- You're returning their call / following up. Find out how we can help and offer to book a visit or
  have the office call them back.
```

**First message:**
```
Hi, this is Pete calling from {{company}} — am I reaching {{customerName}}?
```

## 4. Wire the result webhook
In the assistant's **Server URL** (or Messaging → Server URL), set:
```
https://<your-production-url>/api/vapi?secret=<your VAPI_WEBHOOK_SECRET>
```
That's how the recording, summary, ended-reason, and duration land back on each call in `pete_calls`.

## 5. Test, then go live
1. Put your own cell in `PETE_TEST_NUMBERS`.
2. On `/pete`, queue a **test** call to yourself (test mode dials the allow-list immediately).
3. Confirm Pete sounds right and the call shows recording + summary after it ends.
4. Then use it for real: queue a customer call → an approver releases it on `/pete`.

Roles: who can queue vs. who can approve is in `lib/pete.js` (`canUsePete` / `canApprovePete`).
