import { redirect } from 'next/navigation';

// The Invoice tab merged into the unified 💵 Quote tab (estimate → accept = invoice). Anything still linking
// to /invoice lands on the same job's Quote tab. (The printable /invoice/summary route is separate, unaffected.)
export default function InvoiceTab({ params }) {
  redirect(`/job/${params.id}/estimate`);
}
