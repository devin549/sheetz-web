import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const outputDir = path.join(root, '.audits');
const outputFile = path.join(outputDir, 'tech-ipad-port-agent-report.md');

const TEXT_EXTENSIONS = new Set(['.gs', '.js', '.jsx', '.mjs', '.html', '.css', '.json', '.md', '.sql']);

const CANONICAL_FEATURES = [
  {
    id: 'my-day',
    label: 'My Day job list',
    priority: 'P0',
    currentPaths: ['app/(main)/my-day/page.js'],
    currentSignals: ['My Day', 'scopeName', 'date summary', 'statusPill'],
    legacySignals: ['my day', 'today', 'job card', 'techipad'],
    target: '/my-day',
  },
  {
    id: 'job-detail',
    label: 'Job detail / work order',
    priority: 'P0',
    currentPaths: ['app/(main)/job', 'app/(main)/board/JobPanel.js'],
    currentSignals: ['JobPanel', 'Customer', 'Schedule', 'Billing'],
    requiredRoutePrefix: '/job',
    legacySignals: ['job detail', 'workorder', 'open job', 'customer signature'],
    target: '/job/[id]',
  },
  {
    id: 'status-flow',
    label: 'Status flow: en route, on site, complete',
    priority: 'P0',
    currentPaths: ['app/(main)/board/actions.js', 'app/(main)/board/JobPanel.js'],
    currentSignals: ['enroute', 'on_site', 'done', 'statusPill'],
    legacySignals: ['en route', 'on site', 'complete', 'updateStatus'],
    target: 'server action + job_activity',
  },
  {
    id: 'photo-upload',
    label: 'Job photos and uploads',
    priority: 'P0',
    currentPaths: ['app', 'lib', 'supabase'],
    currentSignals: ['job_photos', 'photo upload', 'Supabase Storage', 'storage.from'],
    legacySignals: ['photo', 'upload', 'driveapp', 'video'],
    target: 'Supabase Storage',
  },
  {
    id: 'closeout',
    label: 'Closeout, notes, completion summary',
    priority: 'P0',
    currentPaths: ['app', 'supabase'],
    currentSignals: ['completed_at', 'closeout', 'job_activity', 'work_orders'],
    legacySignals: ['closeout', 'completion', 'notes', 'summary'],
    target: 'job_activity + work_orders',
  },
  {
    id: 'helper-scope',
    label: 'Helper rides with paired tech',
    priority: 'P0',
    currentPaths: ['app/(main)/my-day/page.js', 'supabase/06_helper_assign.sql'],
    currentSignals: ['helper_assignments', 'helper', 'paired tech'],
    legacySignals: ['helper', 'ride', 'paired'],
    target: 'helper_assignments',
  },
  {
    id: 'search',
    label: 'Search job / invoice / receipt by number',
    priority: 'P1',
    currentPaths: ['app/(main)/my-day/page.js'],
    currentSignals: ['find job', 'receipt', 'invoice', 'search'],
    legacySignals: ['search', 'invoice', 'receipt', 'job number'],
    target: '/my-day search',
  },
  {
    id: 'week-view',
    label: 'Week view',
    priority: 'P1',
    currentPaths: ['app/(main)/my-day/page.js'],
    currentSignals: ['View the week', 'week view'],
    legacySignals: ['week', 'calendar', 'next day'],
    target: '/my-day week mode',
  },
  {
    id: 'truck-tools',
    label: 'Truck/tools actions',
    priority: 'P1',
    currentPaths: ['app/(main)/my-truck/page.js', 'supabase'],
    currentSignals: ['request transfer', 'loan a tool', 'truck_transfers', 'tool_loans'],
    legacySignals: ['truck', 'tool', 'transfer', 'loan'],
    target: '/my-truck',
  },
  {
    id: 'shift',
    label: 'Start/end shift and on-shift toggle',
    priority: 'P1',
    currentPaths: ['app', 'supabase'],
    currentSignals: ['shift', 'on shift'],
    legacySignals: ['start shift', 'end shift', 'on shift'],
    target: 'timesheets',
  },
  {
    id: 'customer-hand-off',
    label: 'Hand to Customer mode',
    priority: 'P1',
    currentPaths: ['app', 'supabase'],
    currentSignals: ['Hand to Customer', 'customer portal'],
    legacySignals: ['hand to customer', 'signature', 'customer view'],
    target: 'job customer view',
  },
  {
    id: 'bids',
    label: 'Bids / estimates',
    priority: 'P1',
    currentPaths: ['app', 'supabase'],
    currentSignals: ['bids', 'estimate'],
    legacySignals: ['bid', 'estimate', 'proposal'],
    target: '/bids or job detail',
  },
  {
    id: 'chat',
    label: 'Tech chat / help request',
    priority: 'P1',
    currentPaths: ['app', 'supabase'],
    currentSignals: ['chat', 'help request'],
    legacySignals: ['chat', 'helprequest', 'message'],
    target: 'messages/help_requests',
  },
  {
    id: 'pay',
    label: 'Pay / daily money view',
    priority: 'P2',
    currentPaths: ['app/(main)/my-day/page.js', 'app/(main)/pay'],
    currentSignals: ['Today $', 'commission', 'payroll_runs'],
    legacySignals: ['pay', 'commission', 'today $'],
    target: 'payroll later',
  },
  {
    id: 'hank',
    label: 'Ask Hank assistant',
    priority: 'P2',
    currentPaths: ['app', 'lib'],
    currentSignals: ['Hank', 'ANTHROPIC_API_KEY'],
    legacySignals: ['hank', 'ai', 'ask'],
    target: 'AI provider route',
  },
  {
    id: 'gamification',
    label: 'Races, Vegas, rank, Crown Plunger',
    priority: 'P2',
    currentPaths: ['app', 'supabase'],
    currentSignals: ['Races', 'Vegas', 'rank', 'gamification'],
    legacySignals: ['races', 'vegas', 'rank', 'crown', 'plunger'],
    target: 'culture layer',
  },
];

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
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function sourceCandidates() {
  const fromEnv = process.env.TECH_IPAD_SOURCE_DIR || process.env.LEGACY_TECH_IPAD_DIR;
  return [
    fromEnv,
    path.join(root, 'legacy', 'tech-ipad'),
    path.join(root, 'legacy', 'Dispatch_Sheet'),
    path.join(root, 'Dispatch_Sheet'),
    path.join(root, '..', 'Dispatch_Sheet'),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
}

async function resolveSourceDir() {
  for (const candidate of sourceCandidates()) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function countMatches(content, patterns) {
  const lower = String(content || '').toLowerCase();
  return patterns.reduce((count, pattern) => count + (lower.includes(pattern.toLowerCase()) ? 1 : 0), 0);
}

function extractFunctions(content) {
  const functions = [];
  const re = /\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = re.exec(content))) functions.push(match[1]);
  const arrowRe = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
  while ((match = arrowRe.exec(content))) functions.push(match[1]);
  return [...new Set(functions)].sort();
}

function extractSheets(content) {
  const sheets = new Set();
  const patterns = [
    /getSheetByName\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\bSHEET_?[A-Z0-9_]*\s*=\s*['"`]([^'"`]+)['"`]/g,
    /\bsheetName\s*[:=]\s*['"`]([^'"`]+)['"`]/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(content))) sheets.add(match[1]);
  }
  return [...sheets].sort();
}

function extractUiLabels(content) {
  const labels = new Set();
  const known = [
    'My Day', 'Today', 'My Jobs', 'Bids', 'Chat', 'Hank', 'Pay', 'Races', 'Record',
    'Vegas', 'Cal', 'PTO', 'Start Shift', 'End Shift', 'On shift', 'Hand to Customer',
    'View the week', 'Search', 'Upload', 'Closeout', 'Complete', 'En Route', 'On Site',
  ];
  const lower = String(content || '').toLowerCase();
  for (const label of known) {
    if (lower.includes(label.toLowerCase())) labels.add(label);
  }
  return [...labels].sort();
}

function extractSideEffects(content) {
  const checks = [
    ['Spreadsheet writes', /\b(appendRow|setValue|setValues|deleteRow|clearContent)\b/],
    ['Email send', /\b(MailApp|GmailApp|sendEmail)\b/],
    ['External HTTP', /\b(UrlFetchApp|fetch\()\b/],
    ['Drive files', /\bDriveApp\b/],
    ['Properties/cache/lock', /\b(PropertiesService|CacheService|LockService)\b/],
    ['Triggers', /\bScriptApp\.newTrigger\b/],
  ];
  return checks.filter(([, re]) => re.test(content)).map(([label]) => label);
}

async function inspectLegacy(sourceDir) {
  if (!sourceDir) return null;
  const files = await walk(sourceDir);
  const inspected = [];
  const allFunctions = new Set();
  const allSheets = new Set();
  const allLabels = new Set();
  const sideEffects = new Map();
  let combined = '';

  for (const file of files) {
    const content = await readIfExists(file);
    combined += `\n${content}`;
    const functions = extractFunctions(content);
    const sheets = extractSheets(content);
    const labels = extractUiLabels(content);
    const effects = extractSideEffects(content);
    functions.forEach((fn) => allFunctions.add(fn));
    sheets.forEach((sheet) => allSheets.add(sheet));
    labels.forEach((label) => allLabels.add(label));
    effects.forEach((effect) => {
      const current = sideEffects.get(effect) || [];
      current.push(path.relative(sourceDir, file).replaceAll('\\', '/'));
      sideEffects.set(effect, current);
    });
    inspected.push({
      file: path.relative(sourceDir, file).replaceAll('\\', '/'),
      lines: content.split(/\r?\n/).length,
      functions: functions.length,
      sheets,
      labels,
      effects,
    });
  }

  return {
    sourceDir,
    files: inspected.sort((a, b) => b.functions - a.functions || a.file.localeCompare(b.file)),
    functionNames: [...allFunctions].sort(),
    sheets: [...allSheets].sort(),
    labels: [...allLabels].sort(),
    sideEffects: [...sideEffects.entries()].map(([effect, filesForEffect]) => ({
      effect,
      files: [...new Set(filesForEffect)].sort(),
    })),
    combined,
  };
}

async function inspectCurrentApp() {
  const files = [];
  for (const dir of ['app', 'lib', 'supabase']) {
    await walk(path.join(root, dir), files);
  }
  let combined = '';
  const fileContents = new Map();
  const routes = [];
  for (const file of files) {
    const content = await readIfExists(file);
    const rel = relative(file);
    fileContents.set(rel, content);
    combined += `\n${content}`;
    if (/app\/.*\/(page|route)\.(js|jsx)$/.test(rel)) {
      routes.push(rel.replace(/^app\//, '').replace(/\/(page|route)\.(js|jsx)$/, '').replace(/\([^)]*\)\//g, '/'));
    }
  }
  return {
    files,
    fileContents,
    combined,
    routes: [...new Set(routes.map((route) => '/' + route.replace(/^\/+/, '')).map((route) => route === '/(main)' ? '/' : route))].sort(),
  };
}

function featureStatus(feature, legacy, current) {
  const legacyScore = legacy ? countMatches(legacy.combined, feature.legacySignals) : 0;
  const scopedContent = feature.currentPaths && feature.currentPaths.length
    ? [...current.fileContents.entries()]
        .filter(([rel]) => feature.currentPaths.some((prefix) => rel.startsWith(prefix) || rel.includes(prefix)))
        .map(([, content]) => content)
        .join('\n')
    : current.combined;
  const currentScore = countMatches(scopedContent, feature.currentSignals);
  let status = 'missing';
  if (currentScore >= Math.max(2, Math.ceil(feature.currentSignals.length / 2))) status = 'present';
  else if (currentScore > 0) status = 'partial';
  else if (!legacy) status = 'needs-source';
  if (status === 'present' && feature.requiredRoutePrefix) {
    const hasRoute = current.routes.some((route) => route === feature.requiredRoutePrefix || route.startsWith(`${feature.requiredRoutePrefix}/`));
    if (!hasRoute) status = 'partial';
  }
  return {
    ...feature,
    status,
    legacyScore,
    currentScore,
  };
}

function escapePipes(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function table(headers, rows) {
  if (!rows.length) return '_None._\n';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapePipes).join(' | ')} |`),
  ].join('\n') + '\n';
}

function sourceInstructions() {
  return [
    'Export the Apps Script project files for the live Tech iPad into one of these locations:',
    '',
    '```text',
    'legacy/tech-ipad/',
    '  CB_Dispatch_TechIpad*.gs',
    '  CB_Dispatch_TechIpad*.html',
    '  CB_Dispatch_Helper*.gs',
    '  CB_Dispatch_Tools*.gs',
    '  CB_Dispatch_WorkOrder*.gs',
    '```',
    '',
    'Or run with:',
    '',
    '```bash',
    'TECH_IPAD_SOURCE_DIR=C:/path/to/Dispatch_Sheet npm run agent:tech-ipad',
    '```',
  ].join('\n');
}

function recommendedBuildOrder(featureRows) {
  const missing = featureRows.filter((feature) => feature.status !== 'present');
  const p0 = missing.filter((feature) => feature.priority === 'P0');
  const p1 = missing.filter((feature) => feature.priority === 'P1');
  const picked = [...p0, ...p1].slice(0, 8);
  return picked.map((feature, index) => [
    index + 1,
    feature.label,
    feature.priority,
    feature.target,
    feature.status,
  ]);
}

async function main() {
  const sourceDir = await resolveSourceDir();
  const [legacy, current] = await Promise.all([
    inspectLegacy(sourceDir),
    inspectCurrentApp(),
  ]);

  const featureRows = CANONICAL_FEATURES.map((feature) => featureStatus(feature, legacy, current));
  const present = featureRows.filter((feature) => feature.status === 'present').length;
  const partial = featureRows.filter((feature) => feature.status === 'partial').length;
  const missing = featureRows.filter((feature) => feature.status === 'missing').length;
  const needsSource = featureRows.filter((feature) => feature.status === 'needs-source').length;

  const report = [
    '# Tech iPad Port Agent Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Repo root: \`${root}\``,
    '',
    '## Summary',
    '',
    legacy
      ? `Legacy source found at \`${legacy.sourceDir}\`. Scanned ${legacy.files.length} files, ${legacy.functionNames.length} functions, ${legacy.sheets.length} sheet references, and ${legacy.labels.length} UI labels.`
      : 'Legacy Tech iPad source was not found yet. The agent used the current roadmap/checklist and current web app to prepare the port map.',
    '',
    `Current parity signal: ${present} present, ${partial} partial, ${missing} missing, ${needsSource} waiting on source.`,
    '',
    '## Feature Map',
    '',
    table(
      ['Priority', 'Feature', 'Status', 'Target', 'Legacy signal', 'Web signal'],
      featureRows.map((feature) => [
        feature.priority,
        feature.label,
        feature.status,
        feature.target,
        feature.legacyScore,
        feature.currentScore,
      ])
    ),
    '## Recommended Build Order',
    '',
    table(['#', 'Feature', 'Priority', 'Target', 'Current status'], recommendedBuildOrder(featureRows)),
    '## Current Web Routes',
    '',
    table(['Route/file signal'], current.routes.map((route) => [route])),
    '## Legacy Source Inventory',
    '',
    legacy
      ? table(
          ['File', 'Lines', 'Functions', 'Sheets', 'UI labels', 'Side effects'],
          legacy.files.map((file) => [
            file.file,
            file.lines,
            file.functions,
            file.sheets.join(', '),
            file.labels.join(', '),
            file.effects.join(', '),
          ])
        )
      : `${sourceInstructions()}\n`,
    '## Legacy Functions',
    '',
    legacy
      ? table(['Function'], legacy.functionNames.slice(0, 120).map((fn) => [fn]))
      : '_No legacy functions scanned yet._\n',
    '## Legacy Data Dependencies',
    '',
    legacy
      ? table(['Sheet / Store'], legacy.sheets.map((sheet) => [sheet]))
      : '_No legacy sheet references scanned yet._\n',
    '## Side-Effect Review',
    '',
    legacy
      ? table(['Side effect', 'Files'], legacy.sideEffects.map((effect) => [effect.effect, effect.files.join(', ')]))
      : '_No legacy side effects scanned yet._\n',
    '## Porting Rules',
    '',
    '- Keep the old Apps Script Tech iPad live until each workflow reaches parity.',
    '- Port behavior from source; do not reinvent hidden field rules from memory.',
    '- Every mutation needs a server-side role check and an audit/activity row.',
    '- No automatic external customer sends. Draft, approve, log.',
    '- Field workflows must be touch-friendly on iPad and phone.',
    '- Photos/files go to Supabase Storage; metadata belongs in job_activity or work_orders.',
    '- Realtime is a feature requirement after the first status/action flow works.',
    '',
    '## Next Source Needed',
    '',
    legacy
      ? 'Source is present. Next: open the highest-function Tech iPad files and port the first missing P0 workflow.'
      : sourceInstructions(),
    '',
  ].join('\n');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, report, 'utf8');
  console.log(`Tech iPad port agent report written to ${relative(outputFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
