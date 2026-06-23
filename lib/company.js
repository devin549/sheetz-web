// Clog Busterz company info — used on customer-facing docs (statement, letter, packet) + emails.
// ⚠️ CONFIRM these before mailing real statements: the phone is the customer-facing line, and the
// RETURN ADDRESS is what the postal service + customer see. Leave address blank and it's hidden.
export const COMPANY = {
  name: 'Clog Busterz Plumbing',
  phone: '(859) 408-3382',                 // CONFIRM: main customer line
  email: 'billing@clogbusterzplumbing.com', // FROM/reply for statements (set EMAIL_FROM to match)
  website: 'clogbusterzplumbing.com',
  // SET these — printed as the return address + shown through the window envelope:
  address1: '',                             // e.g. '123 Main St'
  address2: '',                             // e.g. 'Richmond, KY 40475'
};

export const companyReturnLines = () => [COMPANY.name, COMPANY.address1, COMPANY.address2].filter(Boolean);
