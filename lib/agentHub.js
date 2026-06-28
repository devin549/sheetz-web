import OpenAI from 'openai';
import { getAnthropic, AI_MODEL } from '@/lib/anthropic';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const AGENT_IDS = [
  'accounting-money',
  'dispatch-ops',
  'price-margin',
  'field-tech-ux',
  'crm-flow',
  'security-risk',
];

export const AGENTS = {
  'accounting-money': {
    id: 'accounting-money',
    name: 'Accounting / Money Agent',
    claudeRole: 'accounting',
    mission:
      'Find money leaks, AR risk, payment/webhook issues, fee-split problems, payroll/cash-custody risk, duplicate payments, missing receipts, and billing work that needs an internal approver.',
  },
  'dispatch-ops': {
    id: 'dispatch-ops',
    name: 'Dispatch Ops Agent',
    claudeRole: 'gm',
    mission:
      'Find stale jobs, unassigned work, late/running-long jobs, helper needs, tech capacity problems, ETA/customer-notification gaps, carryovers, and board workflow issues.',
  },
  'price-margin': {
    id: 'price-margin',
    name: 'Price Book / Margin Agent',
    claudeRole: 'owner',
    mission:
      'Find price-book gaps, repeated parts/tools used with job types, margin leaks, vendor price changes, missing add-ons, and price-change suggestions that need owner approval.',
  },
  'field-tech-ux': {
    id: 'field-tech-ux',
    name: 'Field Tech UX Agent',
    claudeRole: 'gm',
    mission:
      'Review tech iPad and helper phone workflows for wasted taps, bad rail/tab organization, hidden blockers, confusing job-card order, missing quick actions, and anything that makes field work slower.',
  },
  'crm-flow': {
    id: 'crm-flow',
    name: 'CRM Flow Agent',
    claudeRole: 'gm',
    mission:
      'Review customer/job/project flows from call booking through dispatch, tech work, proof, estimate, invoice, payment, follow-up, and customer profile history. Find missing handoffs and information that should be surfaced earlier.',
  },
  'security-risk': {
    id: 'security-risk',
    name: 'Security / Launch Risk Agent',
    claudeRole: 'owner',
    mission:
      'Find launch risks around roles, permissions, customer data exposure, public endpoints, payment/webhook safety, audit logs, screenshot/watermark leakage, and manager-only override controls.',
  },
};

const OPENAI_MODEL = process.env.OPENAI_COLLABORATOR_MODEL || 'gpt-5';
const CLAUDE_MODEL = process.env.ANTHROPIC_AGENT_MODEL || AI_MODEL;

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

function daysAgoISO(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function isColumnMismatch(message) {
  return /column .* does not exist|could not find .* column|schema cache/i.test(message || '');
}

async function safeQuery(label, queryBuilder, options = {}) {
  try {
    const { data, error } = await queryBuilder;
    return {
      label,
      data: data || [],
      error: error?.message || null,
      optional: options.optional !== false,
    };
  } catch (error) {
    return {
      label,
      data: [],
      error: error?.message || String(error),
      optional: options.optional !== false,
    };
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

  return {
    label: 'todaysJobs',
    optional: false,
    error: res.error?.message || null,
    data: (res.data || []).map((job) => ({
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
    })),
  };
}

async function queryTopPastDue(sb) {
  const invoices = await safeQuery(
    'openInvoices',
    sb
      .from('invoices')
      .select('id, invoice_number, invoice_date, status, total, balance, customer_id')
      .eq('status', 'open')
      .order('balance', { ascending: false, nullsFirst: false })
      .limit(100),
    { optional: false }
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

  return {
    label: 'topPastDue',
    optional: false,
    error: null,
    data: (invoices.data || []).map((invoice) => ({
      id: invoice.id,
      customer_name: nameById[invoice.customer_id]?.name || 'Customer',
      customer_phone: nameById[invoice.customer_id]?.phone || '',
      customer_email: nameById[invoice.customer_id]?.email || '',
      invoice_number: invoice.invoice_number || '',
      invoice_date: invoice.invoice_date || null,
      status: invoice.status || 'open',
      total: Number(invoice.total) || 0,
      balance: Number(invoice.balance) || 0,
    })),
  };
}

export async function gatherAgentSnapshot() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Supabase admin client is not configured.');

  const now = new Date();
  const todayStart = startOfDayISO(now);
  const todayEnd = endOfDayISO(now);
  const sevenDaysAgo = daysAgoISO(now, 7);
  const thirtyDaysAgo = daysAgoISO(now, 30);

  const results = await Promise.all([
    queryTodaysJobs(sb, todayStart, todayEnd),
    queryTopPastDue(sb),
    safeQuery(
      'recentPayments',
      sb
        .from('payments')
        .select('id, invoice_id, customer_id, amount, fee_amount, method, status, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'recentReceipts',
      sb
        .from('receipts')
        .select('id, job_id, tech_id, vendor, total, status, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'payrollQueue',
      sb
        .from('payroll_runs')
        .select('id, period_start, period_end, status, gross_total, created_at')
        .order('created_at', { ascending: false })
        .limit(25)
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
      'recentJobMoves',
      sb
        .from('job_moves')
        .select('job_id, action, from_tech_name, to_tech_name, by_email, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'failedCloseouts',
      sb
        .from('job_photo_reviews')
        .select('job_id, photo_id, fail_reason, manager_note, reviewed_by_name, created_at')
        .eq('result', 'fail')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(75)
    ),
    safeQuery(
      'jobMediaCounts',
      sb
        .from('job_photos')
        .select('job_id, kind, media_type, archived, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(250)
    ),
    safeQuery(
      'inventoryLowStock',
      sb
        .from('truck_inventory')
        .select('id, truck_id, item_name, qty, par_qty, location')
        .limit(200)
    ),
    safeQuery(
      'tools',
      sb
        .from('tools')
        .select('id, name, status, assigned_to, truck_id, location, updated_at')
        .limit(200)
    ),
    safeQuery(
      'priceBookItems',
      sb
        .from('price_book_items')
        .select('id, name, category, price, cost, active, updated_at')
        .limit(200)
    ),
    safeQuery(
      'recentProposals',
      sb
        .from('proposals')
        .select('id, job_id, customer_id, status, amount, accepted_at, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'vendorPrices',
      sb
        .from('vendor_prices')
        .select('id, vendor, item_name, sku, price, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200)
    ),
    safeQuery(
      'purchaseOrders',
      sb
        .from('purchase_orders')
        .select('id, vendor, status, total, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
  ]);

  const byLabel = {};
  results.forEach((result) => { byLabel[result.label] = result.data || []; });

  return {
    generated_for: now.toISOString(),
    date_window: { today_start: todayStart, today_end: todayEnd, seven_days_ago: sevenDaysAgo, thirty_days_ago: thirtyDaysAgo },
    data_errors: results.filter((item) => item.error && !item.optional).map((item) => ({ source: item.label, error: item.error })),
    optional_warnings: results.filter((item) => item.error && item.optional).map((item) => ({ source: item.label, warning: item.error })),
    todays_jobs: byLabel.todaysJobs || [],
    top_past_due: byLabel.topPastDue || [],
    recent_payments: byLabel.recentPayments || [],
    recent_receipts: byLabel.recentReceipts || [],
    payroll_queue: byLabel.payrollQueue || [],
    open_eta_reports: byLabel.openEtaReports || [],
    recent_job_moves: byLabel.recentJobMoves || [],
    failed_closeouts: byLabel.failedCloseouts || [],
    job_media_counts: byLabel.jobMediaCounts || [],
    inventory_low_stock: byLabel.inventoryLowStock || [],
    tools: byLabel.tools || [],
    price_book_items: byLabel.priceBookItems || [],
    recent_proposals: byLabel.recentProposals || [],
    vendor_prices: byLabel.vendorPrices || [],
    purchase_orders: byLabel.purchaseOrders || [],
  };
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Agent did not return JSON.');
    return JSON.parse(match[0]);
  }
}

function fallbackAgentReport(agent, text, error) {
  const raw = String(text || '').trim();
  const summary = raw
    ? raw.slice(0, 1200)
    : `${agent.name} returned an empty non-JSON response.`;

  return {
    summary,
    findings: [
      `${agent.name} returned useful output that was not valid JSON, so Sheetz wrapped it as raw_text.`,
    ],
    recommended_actions: [
      'Review the raw_text and keep this fallback until the agent prompt is consistently returning structured JSON.',
    ],
    questions_for_owner: [],
    report_to_collaborator: [
      `${agent.name} needs response-format tightening, but its raw output was preserved for review.`,
    ],
    parse_warning: error.message || String(error),
    raw_text: raw.slice(0, 4000),
  };
}

function normalizeString(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeList(values, maxItems = 12, maxLength = 800) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => normalizeString(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeReviewContext(options = {}) {
  return {
    focus: normalizeString(options.focus, 2500),
    notes: normalizeString(options.notes || options.brief, 5000),
    urls: normalizeList(options.urls, 12, 800),
    screenshots: Array.isArray(options.screenshots)
      ? options.screenshots
        .map((shot) => ({
          name: normalizeString(shot?.name || shot?.title, 160),
          url: normalizeString(shot?.url || shot?.path, 800),
          notes: normalizeString(shot?.notes || shot?.description, 1200),
        }))
        .filter((shot) => shot.name || shot.url || shot.notes)
        .slice(0, 12)
      : [],
  };
}

function normalizeAgentIds(ids) {
  const requested = Array.isArray(ids) && ids.length ? ids : AGENT_IDS;
  return requested.map((id) => String(id || '').trim()).filter((id) => AGENTS[id]);
}

export async function runClaudeAgent(agentId, snapshot, reviewContext = {}) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const client = getAnthropic(agent.claudeRole);
  if (!client) {
    return {
      ok: false,
      configured: false,
      agent: { id: agent.id, name: agent.name, claudeRole: agent.claudeRole },
      error: `Missing Claude key for ${agent.claudeRole}. Set ANTHROPIC_KEY_${agent.claudeRole.toUpperCase()} or ANTHROPIC_KEY_OWNER.`,
    };
  }

  const system = `
You are the ${agent.name} for Clog Busterz Sheetz Web.
Mission: ${agent.mission}

Rules:
- Read-only. Never claim you changed data, sent customer messages, approved payroll, or moved a job.
- Customer-facing, payroll, price, and payment changes require manager approval.
- Be direct, practical, specific, and fair.
- If tables are missing, report the software/data gap without pretending the business is broken.
- Use the review context if supplied, but do not claim you browsed a URL or inspected a screenshot unless its content is included.
- Return strict JSON only with this shape:
{
  "summary": "short plain-English readout",
  "findings": ["specific issue or opportunity"],
  "recommended_actions": ["manager-approved action to take"],
  "questions_for_owner": ["question if needed"],
  "report_to_collaborator": ["1-line signal the collaborator should roll up"]
}
  `.trim();

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1800,
      system,
      messages: [
        {
          role: 'user',
          content: `Audit this snapshot and review context for your mission. Return JSON only.\n\n${JSON.stringify({
            reviewContext,
            snapshot,
          })}`,
        },
      ],
    });

    const text = (response.content || [])
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n')
      .trim();

    let report;
    let parseWarning = null;
    try {
      report = parseJsonObject(text);
    } catch (error) {
      parseWarning = error.message || String(error);
      report = fallbackAgentReport(agent, text, error);
    }

    return {
      ok: true,
      configured: true,
      model: CLAUDE_MODEL,
      agent: { id: agent.id, name: agent.name, claudeRole: agent.claudeRole },
      report,
      warning: parseWarning,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      model: CLAUDE_MODEL,
      agent: { id: agent.id, name: agent.name, claudeRole: agent.claudeRole },
      error: error.message || String(error),
    };
  }
}

const collaboratorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    highest_risks: { type: 'array', items: { type: 'string' } },
    money_moves: { type: 'array', items: { type: 'string' } },
    dispatch_moves: { type: 'array', items: { type: 'string' } },
    pricebook_moves: { type: 'array', items: { type: 'string' } },
    ux_flow_moves: { type: 'array', items: { type: 'string' } },
    security_moves: { type: 'array', items: { type: 'string' } },
    software_gaps: { type: 'array', items: { type: 'string' } },
    questions_for_devin: { type: 'array', items: { type: 'string' } },
    next_7_days: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'highest_risks',
    'money_moves',
    'dispatch_moves',
    'pricebook_moves',
    'ux_flow_moves',
    'security_moves',
    'software_gaps',
    'questions_for_devin',
    'next_7_days',
  ],
};

export async function runCollaboratorRollup(agentReports, snapshot, reviewContext = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, configured: false, error: 'OPENAI_API_KEY is not configured.' };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      instructions: `
You are the Clog Busterz Business Collaborator.
Roll up the specialist agents into one owner/GM report.
Do not claim any action was taken. Keep all customer-facing, payroll, price, and payment actions manager-approved.
If one specialist is missing a key or table, call that out as a software setup gap.
If UX/CRM/security agents were included, put their concrete workflow recommendations in ux_flow_moves and security_moves.
    `.trim(),
      input: [
        {
          role: 'user',
          content: `Create the collaborator rollup from these specialist agent reports and snapshot warnings.\n\n${JSON.stringify({
            agentReports,
            reviewContext,
            data_errors: snapshot.data_errors,
            optional_warnings: snapshot.optional_warnings,
          })}`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'cb_agent_hub_rollup',
          strict: true,
          schema: collaboratorSchema,
        },
      },
    });

    return {
      ok: true,
      configured: true,
      model: OPENAI_MODEL,
      report: JSON.parse(response.output_text),
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      model: OPENAI_MODEL,
      error: error.message || String(error),
    };
  }
}

export async function runAgentHub(options = {}) {
  const agentIds = normalizeAgentIds(options.agents);
  const reviewContext = normalizeReviewContext(options);
  const snapshot = await gatherAgentSnapshot();
  const agentReports = await Promise.all(agentIds.map(async (id) => {
    try {
      return await runClaudeAgent(id, snapshot, reviewContext);
    } catch (error) {
      const agent = AGENTS[id] || { id, name: id, claudeRole: 'unknown' };
      return {
        ok: false,
        configured: false,
        agent: { id: agent.id, name: agent.name, claudeRole: agent.claudeRole },
        error: error.message || String(error),
      };
    }
  }));
  const collaborator = options.collaborator === false
    ? null
    : await runCollaboratorRollup(agentReports, snapshot, reviewContext);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    reviewContext,
    agents: agentReports,
    collaborator,
    snapshotWarnings: [...snapshot.data_errors, ...snapshot.optional_warnings],
  };
}
