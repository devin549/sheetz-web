import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function listSqlFiles(root) {
  const dir = path.join(root, 'supabase');
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function extractTouchedObjects(sql) {
  const scrubbed = String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/'([^']|'')*'/g, "''");
  const cteNames = new Set();
  const ctePattern = /\b(?:with|,)\s+([a-zA-Z0-9_]+)\s+as\s*\(/gi;
  let cteMatch;
  while ((cteMatch = ctePattern.exec(scrubbed))) cteNames.add(cteMatch[1]);
  const objects = new Set();
  const patterns = [
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi,
    /\balter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi,
    /\bfrom\s+(?:public\.)?([a-zA-Z0-9_]+)/gi,
    /\bjoin\s+(?:public\.)?([a-zA-Z0-9_]+)/gi,
    /\binsert\s+into\s+(?:public\.)?([a-zA-Z0-9_]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(scrubbed))) {
      if (!cteNames.has(match[1])) objects.add(match[1]);
    }
  }
  return [...objects].sort();
}

async function psql(databaseUrl, query) {
  const { stdout } = await execFileAsync('psql', [databaseUrl, '-At', '-c', query], {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}

async function inspectLiveDatabase(databaseUrl) {
  const tablesRaw = await psql(databaseUrl, `
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name;
  `);
  const tables = tablesRaw ? tablesRaw.split(/\r?\n/).filter(Boolean) : [];

  const rlsRaw = await psql(databaseUrl, `
    select relname || '|' || relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by relname;
  `);
  const rls = rlsRaw ? rlsRaw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [table, enabled] = line.split('|');
    return { table, enabled: enabled === 't' };
  }) : [];

  const indexesRaw = await psql(databaseUrl, `
    select schemaname || '.' || tablename || '|' || indexname
    from pg_indexes
    where schemaname = 'public'
    order by tablename, indexname;
  `);
  const indexCountByTable = {};
  for (const line of indexesRaw.split(/\r?\n/).filter(Boolean)) {
    const [tableRef] = line.split('|');
    const table = tableRef.split('.').pop();
    indexCountByTable[table] = (indexCountByTable[table] || 0) + 1;
  }

  return { tables, rls, indexCountByTable };
}

export async function auditSupabase({ root }) {
  const findings = [];
  const notes = [];
  const migrationFiles = await listSqlFiles(root);
  const migrations = [];

  for (const file of migrationFiles) {
    const sql = await readIfExists(file);
    migrations.push({
      file: path.relative(root, file).replaceAll('\\', '/'),
      touchedObjects: extractTouchedObjects(sql),
      lineCount: sql.split(/\r?\n/).length,
      hasRls: /\b(row level security|enable row level security|policy)\b/i.test(sql),
      hasIndex: /\bcreate\s+index\b/i.test(sql),
    });
  }

  const migrationObjects = new Set(migrations.flatMap((m) => m.touchedObjects));
  for (const expected of ['jobs', 'customers', 'techs']) {
    if (!migrationObjects.has(expected)) {
      findings.push({ severity: 'medium', title: `No local migration mentions ${expected}`, detail: 'The auditor could not confirm this core table from local SQL files.' });
    }
  }

  const databaseUrl = process.env.SOFTWARE_AUDITOR_DATABASE_URL || process.env.DATABASE_URL || '';
  let live = null;
  if (!databaseUrl) {
    notes.push('Live DB inspection skipped. Set SOFTWARE_AUDITOR_DATABASE_URL to a read-only Postgres URL to inspect schema, RLS, and indexes.');
  } else {
    try {
      live = await inspectLiveDatabase(databaseUrl);
      const noRls = live.rls.filter((row) => !row.enabled).map((row) => row.table);
      if (noRls.length) {
        findings.push({
          severity: 'high',
          title: 'Some public tables have RLS disabled',
          detail: noRls.slice(0, 20).join(', ') + (noRls.length > 20 ? `, +${noRls.length - 20} more` : ''),
        });
      }
      for (const table of ['jobs', 'customers', 'invoices', 'leads']) {
        if (!live.tables.includes(table)) {
          findings.push({ severity: table === 'leads' ? 'medium' : 'high', title: `Live DB missing ${table}`, detail: `The ${table} table was not found in public schema.` });
        }
      }
    } catch (error) {
      findings.push({
        severity: 'medium',
        title: 'Live DB inspection failed',
        detail: `The auditor only runs read-only queries, but psql or the connection was unavailable: ${String(error.message || error)}`,
      });
    }
  }

  return {
    findings,
    notes,
    migrations,
    live,
  };
}
