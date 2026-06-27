import LegalDoc from '@/components/LegalDoc';
import { HANDBOOK_SECTIONS, HANDBOOK_INTRO } from '@/lib/legalDocs';

export const metadata = { title: 'CB Employee Handbook' };

// Standalone route (outside the (main) onboarding gate) so a tech can open + read the Handbook during
// onboarding. Content = the official CB Employee Handbook (06/27/2026), verbatim.
export default function HandbookPage() {
  return <LegalDoc title="Employee Handbook" sections={HANDBOOK_SECTIONS} note={HANDBOOK_INTRO} />;
}
