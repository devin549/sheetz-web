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

function isColumnMismatch(message) {
  return /column .* does not exist|could not find .* column|schema cache/i.test(message || '');
}

async function safeQuery(label, queryBuilder, options = {}) {
  try {
    const { data, error } = await queryBuilder;
    return { label, data: data || [], error: error?.message || null, optional: !!options.optional };
  } catch (error) {
    return { label, data: [], error: error?.message || String(error), optional: !!options.optional };
  }
}

async function queryTodaysJobs(sb, todayStart, todayEnd) {
  const run = (extra = '') => sb
    .from('jobs')
    .select('id, status, priority, scheduled_at, tech_id' + extra + ', customers(name, address, phone), techs(name)')
    .gte('scheduled_at', todayStart)
    .lte('scheduled_at', todayEnd)
    .order('scheduled_at', { ascending: true })
    .limit(250);

  let res = await run(', job_number, job_type, amount, tech_name, duration_min');
  if (res.error && isColumnMismatch(res.error.message)) res = await run(', job_type, amount');
  if (res.error && isColumnMismatch(res.error.message)) res = await run('');

  const data = (res.data || []).map((job) => ({
    id: job.id,
    job_number: job.job_number || null,
    status: job.status || '',
    priority: job.priority || '',
    scheduled_at: job.scheduled_at || null,
    job_type: job.job_type || '',
    amount: Number(job.amount) || 0,
    duration_min: job.duration_min || null,
    customer_name: job.customers?.name || 'Customer',
    customer_phone: job.customers?.phone || '',
    customer_address: job.customers?.address || '',
    tech_id: job.tech_id || null,
    tech_name: job.tech_name || job.techs?.name || '',
  }));

  return { label: 'todaysJobs', data, error: res.error?.message || null, optional: false };
}

async function queryTopPastDue(sb) {
  const invoices = await safeQuery(
    'openInvoices',
    sb
      .from('invoices')
      .select('id, invoice_number, invoice_date, status, total, balance, customer_id')
      .eq('status', 'open')
      .order('balance', { ascending: false, nullsFirst: false })
      .limit(75)
  );

  if (invoices.error) return { label: 'topPastDue', data: [], error: invoices.error, optional: false };

  const ids = [...new Set((invoices.data || []).map((row) => row.customer_id).filter(Boolean))];
  const nameById = {};
  if (ids.length) {
    const customers = await safeQuery(
      'pastDueCustomers',
      sb.from('customers').select('id, name, phone, email').in('id', ids.slice(0, 300))
    );
    (customers.data || []).forEach((customer) => { nameById[customer.id] = customer; });
  }

  const data = (invoices.data || []).map((invoice) => ({
    id: invoice.id,
    customer_name: nameById[invoice.customer_id]?.name || 'Customer',
    customer_phone: nameById[invoice.customer_id]?.phone || '',
    customer_email: nameById[invoice.customer_id]?.email || '',
    invoice_number: invoice.invoice_number || '',
    invoice_date: invoice.invoice_date || null,
    status: invoice.status || 'open',
    total: Number(invoice.total) || 0,
    balance: Number(invoice.balance) || 0,
  }));

  return { label: 'topPastDue', data, error: null, optional: false };
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
    queryTodaysJobs(sb, todayStart, todayEnd),
    safeQuery(
      'openEtaReports',
      sb
        .from('job_eta_updates')
        .select('id, job_id, minutes, note, needs_help, customer_notified, created_by_name, created_at')
        .is('ack_at', null)
        .order('created_at', { ascending: false })
        .limit(75),
      { optional: true }
    ),
    safeQuery(
      'failedCloseouts',
      sb
        .from('job_photo_reviews')
        .select('job_id, photo_id, fail_reason, manager_note, reviewed_by_name, created_at')
        .eq('result', 'fail')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(75),
      { optional: true }
    ),
    queryTopPastDue(sb),
    safeQuery(
      'recentReviews',
      sb
        .from('reviews')
        .select('customer_name, rating, text, source, tech_name, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50),
      { optional: true }
    ),
    safeQuery(
      'recentMoves',
      sb
        .from('job_moves')
        .select('job_id, action, from_tech_name, to_tech_name, by_email, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(100),
      { optional: true }
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
    .filter((item) => item.error && !item.optional)
    .map((item) => ({ source: item.label, error: item.error }));

  const warnings = [
    todaysJobs,
    openEtaReports,
    failedCloseouts,
    topPastDue,
    recentReviews,
    recentMoves,
    cancellations,
  ]
    .filter((item) => item.error && item.optional)
    .map((item) => ({ source: item.label, warning: item.error }));

  return {
    generated_for: now.toISOString(),
    date_window: {
      today_start: todayStart,
      today_end: todayEnd,
      seven_days_ago: sevenDaysAgo.toISOString(),
    },
    data_errors: errors,
    optional_warnings: warnings,
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
If optional_warnings mention missing optional tables such as reviews, QA, ETA, or job move history, report that as a software/data gap but do not call the whole snapshot blind when jobs or AR loaded.
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
      snapshotWarnings: [...snapshot.data_errors, ...snapshot.optional_warnings],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
}
