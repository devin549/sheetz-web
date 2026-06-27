'use client';

// Remove (retire) a tool from the roster — manager-only, used in the My Truck → My Tools sub-tab. Retire is
// a soft state in the custody ledger (logToolEvent 'retired'), not a hard delete, so the history survives.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logToolEvent } from '../tools/ledgerActions';

export default function ToolRemoveBtn({ toolId, toolName }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!window.confirm(`Remove ${toolName || 'this tool'} from the roster? It's retired (history kept), not deleted.`)) return;
    start(async () => { const r = await logToolEvent(toolId, 'retired', { note: 'Removed from My Truck' }); if (r?.ok) router.refresh(); });
  };
  return (
    <button onClick={remove} disabled={pending} title="Retire / remove this tool"
      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: 6, padding: '4px 9px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      {pending ? '…' : '✕ Remove'}
    </button>
  );
}
