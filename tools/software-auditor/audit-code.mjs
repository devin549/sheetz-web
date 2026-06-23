import { promises as fs } from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.sql',
  '.html',
  '.txt',
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function walk(dir, files = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function appRouteFromFile(root, file) {
  const rel = path.relative(path.join(root, 'app'), file).replaceAll('\\', '/');
  const parts = rel.split('/');
  const fileName = parts.pop();
  if (!['page.js', 'page.jsx', 'route.js', 'route.jsx'].includes(fileName)) return null;
  const routeParts = parts.filter((part) => !part.startsWith('(') && !part.endsWith(')'));
  const route = '/' + routeParts.join('/');
  return {
    route: route === '/' ? '/' : route.replace(/\/$/, ''),
    kind: fileName.startsWith('route') ? 'api/route' : 'page',
    file: path.relative(root, file).replaceAll('\\', '/'),
  };
}

function addFinding(findings, severity, title, detail, file = null) {
  findings.push({ severity, title, detail, file });
}

function lineNo(content, needle) {
  const idx = content.indexOf(needle);
  if (idx < 0) return null;
  return content.slice(0, idx).split(/\r?\n/).length;
}

export async function auditCode({ root }) {
  const findings = [];
  const notes = [];
  const scanRoots = ['app', 'components', 'docs', 'lib', 'supabase'];
  const files = [];
  for (const scanRoot of scanRoots) {
    await walk(path.join(root, scanRoot), files);
  }
  for (const fileName of ['package.json', 'middleware.js', 'next.config.mjs', 'jsconfig.json']) {
    const file = path.join(root, fileName);
    if (await exists(file)) files.push(file);
  }
  const uniqueFiles = [...new Set(files)];
  const routeFiles = files.filter((file) => file.includes(`${path.sep}app${path.sep}`));
  const routes = routeFiles.map((file) => appRouteFromFile(root, file)).filter(Boolean)
    .sort((a, b) => a.route.localeCompare(b.route) || a.kind.localeCompare(b.kind));

  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = JSON.parse(await readIfExists(packageJsonPath) || '{}');
  const scripts = packageJson.scripts || {};

  if (!scripts.build) addFinding(findings, 'high', 'No build script', 'A deployable Next app should expose npm run build.', 'package.json');
  if (!scripts['audit:software']) addFinding(findings, 'low', 'Software auditor script is not wired', 'Add an npm script so the agent can run from CI or a terminal.', 'package.json');

  const middlewarePath = path.join(root, 'middleware.js');
  const middleware = await readIfExists(middlewarePath);
  if (middleware) {
    const publicSurfaceHints = ['api/leads', 'api/stripe/webhook', 'api/twilio', 'book', 'portal'];
    const missing = publicSurfaceHints.filter((hint) => !middleware.includes(hint));
    if (missing.length) {
      addFinding(
        findings,
        'high',
        'Middleware still gates future public surfaces',
        `The matcher does not mention ${missing.join(', ')}. Public lead intake, booking, customer portals, and webhooks will redirect to /login unless explicitly excluded.`,
        `middleware.js:${lineNo(middleware, 'matcher') || 1}`
      );
    }
  } else {
    addFinding(findings, 'medium', 'No middleware found', 'Auth behavior could not be audited automatically.');
  }

  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!(await exists(workflowsDir))) {
    addFinding(
      findings,
      'medium',
      'No GitHub Actions workflow',
      'Add a small CI workflow for next build plus a secret scan before protected production deploys.',
      '.github/workflows'
    );
  }

  const boardActions = await readIfExists(path.join(root, 'app', '(main)', 'board', 'actions.js'));
  if (boardActions) {
    if (!/job_?moves|audit|activity/i.test(boardActions)) {
      addFinding(
        findings,
        'high',
        'Board moves are not audited yet',
        'assignTech updates the job directly but does not write a move/activity audit row. The live board rules require move history for reassign/reschedule.',
        `app/(main)/board/actions.js:${lineNo(boardActions, 'export async function assignTech') || 1}`
      );
    }
    if (!/cancelled|done/.test(boardActions.slice(boardActions.indexOf('assignTech')))) {
      addFinding(
        findings,
        'high',
        'Assign/move lacks done/cancelled guard',
        'A dispatched-day tool should block moves for completed or cancelled jobs before changing tech_id or scheduled_at.',
        `app/(main)/board/actions.js:${lineNo(boardActions, 'export async function assignTech') || 1}`
      );
    }
  }

  const clientFiles = uniqueFiles.filter((file) => /\.(js|jsx|mjs)$/.test(file));
  for (const file of clientFiles) {
    const content = await readIfExists(file);
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (/['"]use client['"]/.test(content) && /supabaseAdmin|SERVICE_ROLE|SUPABASE_SERVICE_ROLE/.test(content)) {
      addFinding(findings, 'critical', 'Client file references server-only Supabase access', 'Service-role code must never be imported into a client component.', rel);
    }
  }

  const possibleSecrets = [];
  const secretPatterns = [
    { name: 'Supabase service role JWT', re: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g },
    { name: 'Stripe live secret', re: /sk_live_[a-zA-Z0-9]{20,}/g },
    { name: 'OpenAI key', re: /sk-proj-[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{32,}/g },
  ];
  for (const file of uniqueFiles) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (rel.startsWith('package-lock') || rel.endsWith('.png')) continue;
    const content = await readIfExists(file);
    for (const pattern of secretPatterns) {
      const matches = content.match(pattern.re);
      if (matches) possibleSecrets.push({ rel, type: pattern.name, count: matches.length });
    }
  }
  if (possibleSecrets.length) {
    addFinding(
      findings,
      'critical',
      'Potential hardcoded secret found',
      possibleSecrets.map((s) => `${s.type} in ${s.rel} (${s.count})`).join('; '),
      null
    );
  }

  const todoCounts = [];
  for (const file of uniqueFiles) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    const content = await readIfExists(file);
    const matches = content.match(/\b(TODO|FIXME|porting|soon|Next:)\b/gi);
    if (matches) todoCounts.push({ file: rel, count: matches.length });
  }
  todoCounts.sort((a, b) => b.count - a.count);

  const docs = {};
  for (const name of ['BUILD_STATUS.md', 'DISPATCH_BOARD_AUDIT.md', 'WEB_MIGRATION_ROADMAP.md', 'INFRA_GAME_PLAN.md']) {
    const content = await readIfExists(path.join(root, 'docs', name));
    if (content) docs[name] = {
      checkedBoxes: (content.match(/\[[xX]\]|✅/g) || []).length,
      openBoxes: (content.match(/\[ \]|⏳|⬜/g) || []).length,
      mentions: {
        realtime: (content.match(/realtime/gi) || []).length,
        booking: (content.match(/booking/gi) || []).length,
        leads: (content.match(/leads/gi) || []).length,
        audit: (content.match(/audit/gi) || []).length,
      },
    };
  }

  notes.push(`Discovered ${routes.length} app routes and ${uniqueFiles.length} auditable text files.`);
  notes.push(`Top deferred-work files: ${todoCounts.slice(0, 5).map((t) => `${t.file} (${t.count})`).join(', ') || 'none'}.`);

  return {
    routes,
    findings,
    notes,
    docs,
    todoCounts: todoCounts.slice(0, 15),
  };
}
