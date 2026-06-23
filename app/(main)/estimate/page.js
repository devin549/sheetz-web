import { requireHref } from '@/lib/guard';
import EstimateBuilder from './EstimateBuilder';

export const dynamic = 'force-dynamic';

export default async function Estimate() {
  await requireHref('/estimate');
  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1">🧾 Estimate <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· Good / Better / Best</span></div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Build three priced options, then turn the phone to the customer. Choosing records the estimate — it never charges (the office invoices + collects separately).</p>
      <EstimateBuilder />
    </div>
  );
}
