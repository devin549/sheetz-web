import LegalDoc from '@/components/LegalDoc';
import { HANDBOOK_SECTIONS } from '@/lib/legalDocs';

export const metadata = { title: 'CB Employee Handbook' };

// Standalone route (outside the (main) onboarding gate) so a tech can open + read the Handbook during
// onboarding. NOTE: only the policies present in the sandbox sheet are here so far — the full handbook
// document is being pulled in; see docs/handbook_nda_source.md.
export default function HandbookPage() {
  return (
    <LegalDoc
      title="Employee Handbook"
      sections={HANDBOOK_SECTIONS}
      note="📌 This shows the handbook policies currently on file. The complete Employee Handbook is being finalized — ask the office for the full signed copy if you need it."
    />
  );
}
