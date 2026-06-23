// Clog Busterz company info — used on customer-facing docs (statement, letter, packet) + emails.
// ⚠️ CONFIRM these before mailing real statements: the phone is the customer-facing line, and the
// RETURN ADDRESS is what the postal service + customer see. Leave address blank and it's hidden.
export const COMPANY = {
  name: 'Clog Busterz Plumbing Services',
  phone: '(859) 408-3382',
  email: 'Accounting@clogbusterzplumbing.com', // set EMAIL_FROM to match (verify domain in Resend)
  website: 'clogbusterzplumbing.com',
  address1: '105 Moberly Rd',
  address2: 'Richmond, KY 40475',
  logo: '/logo.jpg',                            // served from sheetz-web/public/logo.jpg
};

export const companyReturnLines = () => [COMPANY.name, COMPANY.address1, COMPANY.address2].filter(Boolean);
