import LegalDoc from '@/components/LegalDoc';
import { NDA_SECTIONS } from '@/lib/legalDocs';

export const metadata = { title: 'CB Non-Disclosure Agreement' };

// Standalone route (outside the (main) onboarding gate) so a tech can open + read the full NDA during
// onboarding. Linked from the onboarding "Read it" button.
export default function NdaPage() {
  return <LegalDoc title="Non-Disclosure Agreement" sections={NDA_SECTIONS} />;
}
