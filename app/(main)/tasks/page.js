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
  const { data, error } = await sb.from('tasks')
    .select('id, title, detail, assignee, due_date, priority, status, created_by, created_at, done_at')
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const missing = error && /could not find|does not exist|schema cache/i.test(error.message || '');
  const tasks = data || [];
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done').slice(0, 15);

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="h1">Tasks</div>
      <p className="muted">Office + field to-dos — assign, prioritize, check off.</p>
      {missing
        ? <div className="notice">Tasks needs its table — run <code>supabase/27_tasks.sql</code> in Supabase.</div>
        : error
          ? <div className="notice">Couldn’t load: {error.message}</div>
          : <TasksClient open={open} done={done} />}
    </div>
  );
}
