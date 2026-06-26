// Clog Busterz company info — used on customer-facing docs (statement, letter, packet) + emails.
// ⚠️ CONFIRM these before mailing real statements: the phone is the customer-facing line, and the
// RETURN ADDRESS is what the postal service + customer see. Leave address blank and it's hidden.
export const COMPANY = {
  name: 'Clog Busterz Plumbing Services',
  phone: '(859) 408-3382',
  email: 'Accounting@clogbusterzplumbing.com', // set EMAIL_FROM to match (verify domain in Resend)
  website: 'clogbusterzplumbing.com',
  // Public online-booking site (the new CB site on Vercel). Override with NEXT_PUBLIC_BOOKING_URL once the
  // branded domain (clogbusterzplumbing.com) is pointed at it. Tech links append ?ref=CODE for attribution.
  booking: process.env.NEXT_PUBLIC_BOOKING_URL || 'https://clog-busterz-site-review.vercel.app',
  address1: '105 Moberly Rd',
  address2: 'Richmond, KY 40475',
  logo: '/logo.jpg',                            // served from sheetz-web/public/logo.jpg
};

export const companyReturnLines = () => [COMPANY.name, COMPANY.address1, COMPANY.address2].filter(Boolean);

// Online-booking link with the tech's referral code baked in (?ref=CODE) so an online booking auto-attributes.
export function bookingLink(code) {
  const base = COMPANY.booking;
  if (!code) return base;
  return base + (base.includes('?') ? '&' : '?') + 'ref=' + encodeURIComponent(code);
}
