import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import TasksClient from './TasksClient';

export const dynamic = 'force-dynamic';

export default async function Tasks() {
  await requirePerm('seeReports', 'assignJobs', 'manageUsers');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Tasks</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  // Tier 1: with the P4 alert columns (migration 86). Tier 2: pre-86 base columns so the page still loads.
  const alertCols = 'id, title, detail, assignee, due_date, priority, status, created_by, created_at, done_at, source, kind, entity, entity_id, seen_count';
  const baseCols = 'id, title, detail, assignee, due_date, priority, status, created_by, created_at, done_at';
  const order = (q) => q.order('status', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(300);
  let { data, error } = await order(sb.from('tasks').select(alertCols));
  const alertsReady = !error;
  if (error && /could not find|does not exist|schema cache/i.test(error.message || '')) {
    ({ data, error } = await order(sb.from('tasks').select(baseCols)));
  }

  const missing = error && /could not find|does not exist|schema cache/i.test(error.message || '');
  const tasks = data || [];
  const open = tasks.filter((t) => t.status === 'open' || t.status === 'snoozed' || (!alertsReady && t.status !== 'done'));
  const done = tasks.filter((t) => t.status === 'done').slice(0, 15);

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="h1">Tasks &amp; Alerts</div>
      <p className="muted">Office + field to-dos and the system’s in-app alerts — assign, prioritize, check off.</p>
      {!alertsReady && !missing && <div className="notice" style={{ marginBottom: 10 }}>System alerts need <code>supabase/86_task_alerts.sql</code> — manual tasks work without it.</div>}
      {missing
        ? <div className="notice">Tasks needs its table — run <code>supabase/27_tasks.sql</code> in Supabase.</div>
        : error
          ? <div className="notice">Couldn’t load: {error.message}</div>
          : <TasksClient open={open} done={done} alertsReady={alertsReady} />}
    </div>
  );
}
