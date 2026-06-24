import { NextResponse } from 'next/server';
import { AGENT_IDS, runAgentHub } from '@/lib/agentHub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request) {
  const expected = process.env.AGENT_HUB_SECRET || process.env.COLLABORATOR_AUDIT_SECRET;
  const provided = request.headers.get('x-agent-secret') || request.headers.get('x-audit-secret');
  return Boolean(expected && provided === expected);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    route: '/api/ai/agent-hub',
    readOnly: true,
    agents: AGENT_IDS,
    headers: ['x-agent-secret', 'x-audit-secret'],
    postBody: {
      agents: AGENT_IDS,
      collaborator: true,
    },
  });
}

export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readBody(request);

  try {
    const result = await runAgentHub({
      agents: Array.isArray(body.agents) ? body.agents : AGENT_IDS,
      collaborator: body.collaborator !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 });
  }
}
