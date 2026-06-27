import { requirePerm } from '@/lib/guard';
import WatermarkReveal from './WatermarkReveal';

export const dynamic = 'force-dynamic';

// Owner/office leak-tracer — read the DLP watermark back off a leaked screenshot. Gated to roles that
// could discipline a leak (owner / managers); not for field techs.
export default async function WatermarkRevealPage() {
  await requirePerm('manageUsers', 'seeReports', 'seeFinancials');
  return <WatermarkReveal />;
}
