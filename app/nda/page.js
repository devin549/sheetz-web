import LegalDoc from '@/components/LegalDoc';
import { NDA_SECTIONS, NDA_INTRO } from '@/lib/legalDocs';

export const metadata = { title: 'CB Non-Disclosure Agreement' };

// Standalone route (outside the (main) onboarding gate) so a tech can open + read the full NDA during
// onboarding. Content = the official CB Confidentiality & NDA (06/27/2026), verbatim.
export default function NdaPage() {
  return <LegalDoc title="Confidential Information & Non-Disclosure Agreement" sections={NDA_SECTIONS} note={NDA_INTRO} />;
}
