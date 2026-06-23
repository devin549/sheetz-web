import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCode } from './audit-code.mjs';
import { crawlApp } from './crawl-app.mjs';
import { auditSupabase } from './audit-supabase.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const outputDir = path.join(root, '.audits');
const outputFile = path.join(outputDir, 'software-auditor-report.md');

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function escapePipes(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function asTable(headers, rows) {
  if (!rows.length) return '_None._\n';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapePipes).join(' | ')} |`),
  ].join('\n') + '\n';
}

function groupFindings(...groups) {
  return groups
    .flat()
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

function findingRows(findings) {
  return findings.map((finding) => [
    finding.severity.toUpperCase(),
    finding.title,
    finding.file || '',
    finding.detail,
  ]);
}

function routeRows(routes) {
  return routes.map((route) => [route.route, route.kind, route.file]);
}

function crawlRows(results) {
  return results.map((result) => [
    result.route,
    result.status || 'ERR',
    result.ms != null ? `${result.ms}ms` : '',
    (result.flags || []).join(', '),
    result.title || result.error || '',
  ]);
}

function migrationRows(migrations) {
  return migrations.map((migration) => [
    migration.file,
    migration.lineCount,
    migration.hasIndex ? 'yes' : 'no',
    migration.hasRls ? 'yes' : 'no',
    migration.touchedObjects.slice(0, 8).join(', '),
  ]);
}

function liveDbSummary(live) {
  if (!live) return '_Not inspected._\n';
  const noRls = live.rls.filter((row) => !row.enabled).map((row) => row.table);
  return [
    `- Tables found: ${live.tables.length}`,
    `- Tables with RLS disabled: ${noRls.length ? noRls.join(', ') : 'none detected'}`,
    `- Indexed tables sampled: ${Object.entries(live.indexCountByTable).slice(0, 12).map(([table, count]) => `${table} (${count})`).join(', ') || 'none'}`,
    '',
  ].join('\n');
}

async function main() {
  const started = new Date();
  const [code, crawl, supabase] = await Promise.all([
    auditCode({ root }),
    crawlApp({}),
    auditSupabase({ root }),
  ]);

  const findings = groupFindings(code.findings, crawl.findings, supabase.findings);
  const report = [
    '# Sheetz Software Auditor Report',
    '',
    `Generated: ${started.toISOString()}`,
    `Repo root: \`${root}\``,
    '',
    '## Executive Summary',
    '',
    findings.length
      ? `Found ${findings.length} item(s): ${findings.filter((f) => f.severity === 'critical').length} critical, ${findings.filter((f) => f.severity === 'high').length} high, ${findings.filter((f) => f.severity === 'medium').length} medium, ${findings.filter((f) => f.severity === 'low').length} low.`
      : 'No findings were raised by the read-only checks.',
    '',
    '## Findings',
    '',
    asTable(['Severity', 'Finding', 'File', 'Detail'], findingRows(findings)),
    '## App Routes',
    '',
    asTable(['Route', 'Kind', 'File'], routeRows(code.routes)),
    '## Crawl Results',
    '',
    crawl.skipped
      ? '_Skipped. Set `SOFTWARE_AUDITOR_BASE_URL` to crawl a deployment or local server._\n'
      : asTable(['Route', 'Status', 'Time', 'Flags', 'Title / Error'], crawlRows(crawl.results)),
    '## Supabase',
    '',
    '### Live Database',
    '',
    liveDbSummary(supabase.live),
    '### Local SQL Files',
    '',
    asTable(['File', 'Lines', 'Indexes', 'RLS/Policies', 'Objects touched'], migrationRows(supabase.migrations)),
    '## Roadmap Signals',
    '',
    asTable(
      ['Doc', 'Done markers', 'Open markers', 'Realtime', 'Booking', 'Leads', 'Audit'],
      Object.entries(code.docs).map(([name, doc]) => [
        name,
        doc.checkedBoxes,
        doc.openBoxes,
        doc.mentions.realtime,
        doc.mentions.booking,
        doc.mentions.leads,
        doc.mentions.audit,
      ])
    ),
    '## Deferred Work Hotspots',
    '',
    asTable(['File', 'Count'], code.todoCounts.map((item) => [item.file, item.count])),
    '## Notes',
    '',
    [...code.notes, ...crawl.notes, ...supabase.notes].map((note) => `- ${note}`).join('\n') || '_None._',
    '',
    '## Operating Rules',
    '',
    '- This auditor is read-only.',
    '- It does not submit forms, send messages, mutate database rows, or write app source files.',
    '- For authenticated crawl checks, pass temporary cookies or headers through environment variables and rotate/revoke them after use.',
    '',
  ].join('\n');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, report, 'utf8');
  console.log(`Software auditor report written to ${path.relative(root, outputFile).replaceAll('\\', '/')}`);
  if (findings.some((finding) => finding.severity === 'critical')) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
