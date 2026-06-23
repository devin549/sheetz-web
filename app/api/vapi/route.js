import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Vapi end-of-call webhook. Set the assistant's Server URL to:
//   https://<your-app>/api/vapi?secret=<VAPI_WEBHOOK_SECRET>
// Verifies the shared secret, then stamps the matching pete_calls row with recording + outcome.
export async function POST(req) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (!process.env.VAPI_WEBHOOK_SECRET || secret !== process.env.VAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: 'bad secret' }, { status: 401 });
  }

  let body = {}; try { body = await req.json(); } catch (_) {}
  const msg = body.message || body || {};
  const call = msg.call || {};
  const callId = call.id || msg.callId || '';
  if (!callId) return NextResponse.json({ ok: true });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false }, { status: 500 });

  const type = msg.type || '';
  const patch = {};
  const recording = msg.recordingUrl || (msg.artifact && msg.artifact.recordingUrl);
  const summary = msg.summary || (msg.analysis && msg.analysis.summary);
  if (recording) patch.recording_url = String(recording).slice(0, 500);
  if (summary) patch.summary = String(summary).slice(0, 2000);
  if (msg.endedReason) patch.ended_reason = String(msg.endedReason).slice(0, 120);
  if (msg.durationSeconds != null) patch.duration_s = Math.round(Number(msg.durationSeconds) || 0);
  if (type === 'end-of-call-report') { patch.status = 'completed'; patch.ended_at = new Date().toISOString(); }

  if (Object.keys(patch).length) {
    try { await sb.from('pete_calls').update(patch).eq('vapi_call_id', callId); } catch (_) {}
  }
  return NextResponse.json({ ok: true });
}
