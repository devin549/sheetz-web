import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { searchTools } from '@/lib/tools';
import { can } from '@/lib/roles';
import ToolCard from './ToolCard';
import AddTool from './AddTool';

export const dynamic = 'force-dynamic';

export default async function Tools({ searchParams }) {
  const { role } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs', 'manageInventory');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🔧 Tools</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const q = (searchParams?.q || '').trim();
  const { available, tools } = await searchTools(sb, q);
  const isMgr = can(role, 'manageInventory') || can(role, 'assignJobs') || can(role, 'manageUsers');

  const inputStyle = { flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '11px 13px', borderRadius: 8, fontSize: 15, outline: 'none' };

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">🔧 Tools</div>
      <p className="muted">Find a tool by whatever you call it — “seesnake”, “big reel”, “yellow locator”. It learns the names you use and tracks who’s got it.</p>

      {!available && <div className="notice">Run <code>supabase/81_tool_registry.sql</code> to enable alias search.</div>}

      <form method="get" style={{ display: 'flex', gap: 8, margin: '12px 0 14px' }}>
        <input name="q" defaultValue={q} placeholder="seesnake · k-60 · yellow locator · pro press" style={inputStyle} autoFocus />
        <button className="btn" type="submit">Find</button>
      </form>

      {isMgr && <AddTool />}

      {q && tools.length === 0 && <div className="card" style={{ marginTop: 10 }}><span className="muted">No tool matches “{q}”. {isMgr ? 'Add it above, or' : 'Ask the office to add it, or'} open a matching tool and teach it that name.</span></div>}

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {tools.map((t) => <ToolCard key={t.id} tool={t} isMgr={isMgr} />)}
      </div>
      {!q && tools.length === 0 && available && <div className="card"><span className="muted">No tools in the registry yet{isMgr ? ' — add your first one above.' : '.'}</span></div>}
    </div>
  );
}
