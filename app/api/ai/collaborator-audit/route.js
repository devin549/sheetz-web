import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.OPENAI_COLLABORATOR_MODEL || 'gpt-5';

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function startOfDayISO(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayISO(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

async function safeQuery(label, queryBuilder) {
  try {
    const { data, error } = await queryBuilder;
    return { label, data: data || [], error: error?.message || null };
  } catch (error) {
    return { label, data: [], error: error?.message || String(error) };
  }
}

async function gatherSnapshot() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client is not configured.');

  const now = new Date();
  const todayStart = startOfDayISO(now);
  const todayEnd = endOfDayISO(now);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    todaysJobs,
    openEtaReports,
    failedCloseouts,
    topPastDue,
    recentReviews,
    recentMoves,
    cancellations,
  ] = await Promise.all([
    safeQuery(
      'todaysJobs',
      sb
        .from('jobs')
        .select('id, job_number, customer_name, status, scheduled_at, tech_name, amount, job_type, priority')
        .gte('scheduled_at', todayStart)
        .lte('scheduled_at', todayEnd)
        .order('scheduled_at', { ascending: true })
        .limit(250)
    ),
    safeQuery(
      'openEtaReports',
      sb
        .from('job_eta_updates')
        .select('id, job_id, minutes, note, needs_help, customer_notified, created_by_name, created_at')
        .is('ack_at', null)
        .order('created_at', { ascending: false })
        .limit(75)
    ),
    safeQuery(
      'failedCloseouts',
      sb
        .from('job_photo_reviews')
        .select('job_id, photo_id, fail_reason, manager_note, reviewed_by_name, created_at')
        .eq('result', 'fail')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(75)
    ),
    safeQuery(
      'topPastDue',
      sb
        .from('invoices')
        .select('customer_name, invoice_number, total_due, balance, due_date, aging_bucket, status')
        .order('total_due', { ascending: false })
        .limit(75)
    ),
    safeQuery(
      'recentReviews',
      sb
        .from('reviews')
        .select('customer_name, rating, text, source, tech_name, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50)
    ),
    safeQuery(
      'recentMoves',
      sb
        .from('job_moves')
        .select('job_id, action, from_tech_name, to_tech_name, moved_by, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'cancellations',
      sb
        .from('cancellations')
        .select('job_id, reason_code, reason_note, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(75)
    ),
  ]);

  const errors = [
    todaysJobs,
    openEtaReports,
    failedCloseouts,
    topPastDue,
    recentReviews,
    recentMoves,
    cancellations,
  ]
    .filter((item) => item.error)
    .map((item) => ({ source: item.label, error: item.error }));

  return {
    generated_for: now.toISOString(),
    date_window: {
      today_start: todayStart,
      today_end: todayEnd,
      seven_days_ago: sevenDaysAgo.toISOString(),
    },
    data_errors: errors,
    todays_jobs: todaysJobs.data,
    open_eta_reports: openEtaReports.data,
    failed_closeouts: failedCloseouts.data,
    top_past_due: topPastDue.data,
    recent_reviews: recentReviews.data,
    recent_job_moves: recentMoves.data,
    recent_cancellations: cancellations.data,
  };
}

const reportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    fix_now: { type: 'array', items: { type: 'string' } },
    money_leaks: { type: 'array', items: { type: 'string' } },
    dispatch_alerts: { type: 'array', items: { type: 'string' } },
    tech_coaching: { type: 'array', items: { type: 'string' } },
    accounting_followup: { type: 'array', items: { type: 'string' } },
    review_reputation: { type: 'array', items: { type: 'string' } },
    software_data_risks: { type: 'array', items: { type: 'string' } },
    pspn_segment_notes: { type: 'array', items: { type: 'string' } },
    actions_this_week: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'fix_now',
    'money_leaks',
    'dispatch_alerts',
    'tech_coaching',
    'accounting_followup',
    'review_reputation',
    'software_data_risks',
    'pspn_segment_notes',
    'actions_this_week',
  ],
};

export async function POST(request) {
  const expectedSecret = process.env.COLLABORATOR_AUDIT_SECRET;
  const providedSecret = request.headers.get('x-audit-secret');

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const client = getClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY is not configured.' }, { status: 500 });
  }

  let snapshot;
  try {
    snapshot = await gatherSnapshot();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions: `
You are the Clog Busterz Business Collaborator Audit Agent.
You are read-only. Do not claim you changed data, sent messages, updated payroll, or contacted customers.
Find operational risks, money leaks, coaching opportunities, software/data gaps, and PSPN-worthy highlights.
Be direct, practical, fair, and specific. Roast behavior only, never personal traits or protected characteristics.
Every recommendation should be manager-approved before any customer-facing or payroll action.
      `.trim(),
      input: [
        {
          role: 'user',
          content: `Audit this Sheetz business snapshot and return only the requested JSON report.\n\n${JSON.stringify(snapshot)}`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'cb_collaborator_audit',
          strict: true,
          schema: reportSchema,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      model: MODEL,
      generatedAt: new Date().toISOString(),
      report: JSON.parse(response.output_text),
      snapshotWarnings: snapshot.data_errors,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
}
