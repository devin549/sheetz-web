import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import CustomerMemory from '../CustomerMemory';
import { loadCustomerMemory } from '@/lib/customerMemory';

export const dynamic = 'force-dynamic';

export default async function HistoryTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">History</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const memory = await loadCustomerMemory(c.sb, c.job);
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="History" />
      <CustomerMemory mem={memory} customer={c.customer} job={c.job} />
    </div>
  );
}
