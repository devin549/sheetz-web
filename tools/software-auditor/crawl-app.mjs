const DEFAULT_ROUTES = [
  '/',
  '/board',
  '/my-day',
  '/past-due',
  '/customers',
  '/team',
  '/account',
  '/login',
];

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function titleOf(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function visibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyPage({ status, url, html }) {
  const text = visibleText(html);
  const lower = `${titleOf(html)} ${text}`.toLowerCase();
  const flags = [];
  if (status >= 500) flags.push('server-error');
  if (status >= 400 && status < 500) flags.push('client-error');
  if (/vercel authentication|sso-api|deployment protection/i.test(lower)) flags.push('vercel-protected');
  if (/sign in|signed out|trouble signing in/i.test(lower) && /supabase|sheetz|clog busterz/i.test(lower)) flags.push('app-login');
  if (/next\.js|application error|runtime error|hydration failed|webpack/i.test(lower)) flags.push('framework-error-text');
  if (!text || text.length < 40) flags.push('thin-or-blank');
  if (url && !String(url).startsWith('http')) flags.push('bad-url');
  return { flags, title: titleOf(html), textSample: text.slice(0, 220) };
}

function headersFromEnv() {
  const headers = {
    'user-agent': 'sheetz-software-auditor/0.1 read-only',
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  };
  if (process.env.SOFTWARE_AUDITOR_COOKIE) headers.cookie = process.env.SOFTWARE_AUDITOR_COOKIE;
  if (process.env.SOFTWARE_AUDITOR_BEARER) headers.authorization = `Bearer ${process.env.SOFTWARE_AUDITOR_BEARER}`;
  if (process.env.SOFTWARE_AUDITOR_HEADERS) {
    try {
      Object.assign(headers, JSON.parse(process.env.SOFTWARE_AUDITOR_HEADERS));
    } catch {
      headers['x-auditor-header-parse-error'] = 'true';
    }
  }
  return headers;
}

export async function crawlApp({ baseUrl, routes = DEFAULT_ROUTES, timeoutMs = 10000 } = {}) {
  const normalized = normalizeBaseUrl(baseUrl || process.env.SOFTWARE_AUDITOR_BASE_URL || process.env.AUDIT_BASE_URL);
  const results = [];
  const findings = [];
  const notes = [];

  if (!normalized) {
    return {
      skipped: true,
      findings: [{
        severity: 'medium',
        title: 'App crawl skipped',
        detail: 'Set SOFTWARE_AUDITOR_BASE_URL to crawl a local, preview, or production deployment.',
      }],
      notes,
      results,
    };
  }

  const headers = headersFromEnv();
  const hasPrivateHeaders = Boolean(headers.cookie || headers.authorization || process.env.SOFTWARE_AUDITOR_HEADERS);
  notes.push(`Crawling ${normalized} with ${hasPrivateHeaders ? 'custom auth headers/cookies' : 'no auth headers'}. Header values are never printed.`);

  for (const route of routes) {
    const url = `${normalized}${route.startsWith('/') ? route : `/${route}`}`;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        redirect: 'follow',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();
      const page = classifyPage({ status: response.status, url: response.url, html: body });
      const result = {
        route,
        url,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        ms: Date.now() - started,
        contentType,
        ...page,
      };
      results.push(result);
      if (!response.ok) {
        findings.push({ severity: 'high', title: `Route ${route} returned ${response.status}`, detail: `Final URL: ${response.url}` });
      }
      if (page.flags.includes('vercel-protected')) {
        findings.push({ severity: 'medium', title: `Route ${route} is behind Vercel protection`, detail: 'Use a bypass cookie/token or run against localhost for full UI crawling.' });
      }
      if (page.flags.includes('framework-error-text')) {
        findings.push({ severity: 'high', title: `Route ${route} may show a framework/runtime error`, detail: page.textSample || 'Detected framework error text in HTML.' });
      }
      if (page.flags.includes('thin-or-blank')) {
        findings.push({ severity: 'medium', title: `Route ${route} looked blank/thin`, detail: `Only ${page.textSample.length} visible characters were detected.` });
      }
    } catch (error) {
      results.push({ route, url, ok: false, error: String(error.message || error), ms: Date.now() - started });
      findings.push({ severity: 'high', title: `Route ${route} could not be fetched`, detail: String(error.message || error) });
    }
  }

  return { skipped: false, findings, notes, results };
}
