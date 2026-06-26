import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
// Cal + PTO merged into one screen (Devin) — Calendar lives at the top of /pto now.
export default function Cal() { redirect('/pto'); }
