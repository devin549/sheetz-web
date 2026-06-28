import { requirePerm } from '@/lib/guard';
import EstimateBuilder from './EstimateBuilder';

export const dynamic = 'force-dynamic';

export default async function Estimate() {
  // Pricebook/estimate builder is on the tech rail — allow field crew + office (was sales-nav-gated).
  await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'collectPayment', 'seeFinancials', 'manageInventory', 'seeAllJobs');
  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1">🧾 Estimate <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· Good / Better / Best</span></div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Build three priced options, then turn the phone to the customer. Choosing records the estimate — it never charges (the office invoices + collects separately).</p>
      <EstimateBuilder />
    </div>
  );
}
