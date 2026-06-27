// legalDocs.js — Clog Busterz legal documents (Employee Handbook + NDA).
//
// Source: Google Sheet "CB Tech Sheet v10.15 — SANDBOX", exported to a JSON
// {fileContent} dump. Extracted VERBATIM on 2026-06-27. No text below is
// paraphrased, summarized, or invented — only spreadsheet artifacts (cell
// separators, row-metadata columns) were stripped.
//
// EXTRACTION NOTE: The SANDBOX dump contains the full NON-DISCLOSURE AGREEMENT
// (Articles I–X, complete). It does NOT contain the standalone full Employee
// Handbook policy document — only the acknowledgment line plus handbook-class
// policy statements embedded verbatim in the NDA articles and Setup config rows
// (driving/GPS/speeding, monitoring, company phones, holiday forfeit, and the
// vacation/holiday/rollover/no-fault pay-rate basis). HANDBOOK_SECTIONS below is
// therefore built ONLY from policy text genuinely present in this sheet. The full
// handbook prose (tiered speeding warnings, callback tiers, $7.25 floor, vacation
// accrual, etc.) lives on a separate tab/document that must be pulled before it can
// be ported verbatim. See docs/handbook_nda_source.md.

export const HANDBOOK_SECTIONS = [
  {
    heading: 'Acknowledgment',
    body: 'I have reviewed the Employee Handbook and agree to all terms.',
  },
  {
    heading: 'Driving — Texting & Speeding',
    body:
      'TEXTING AND DRIVING: ZERO TOLERANCE — IMMEDIATE TERMINATION. No warnings, no exceptions. ' +
      'Speeding policy follows Employee Handbook with tiered warnings up to termination. ' +
      'All driving events are monitored via fleet GPS telematics. Phone use while driving is tracked and reported.',
  },
  {
    heading: 'Company Phones',
    body:
      'ALL customer communication must use company-issued phone. Personal calls to customers = write-up (1st), ' +
      'termination (2nd). All calls recorded via Clarity. Outbound + inbound monitored by AI.',
  },
  {
    heading: 'Monitoring & Company Devices',
    body:
      'Company phones, tablets, tools, and equipment are company property and must be returned upon separation of ' +
      'employment. ALL communications on company-issued devices — including text messages, phone calls, emails, photos, ' +
      'browser history, and app usage — are monitored, recorded, reviewed, and stored by Clog Busterz LLC and/or ' +
      'automated systems including artificial intelligence. This monitoring is conducted for fraud prevention, policy ' +
      'enforcement, security, quality assurance, training, and legal compliance.',
  },
  {
    heading: 'On-Call & Holiday Forfeit',
    body: 'HOLIDAY FORFEIT — TRUE = lost all holidays (on-call no-show or 2+ unexcused).',
  },
  {
    heading: 'Pay Rate Basis',
    body: 'HOURLY RATE is used for Vacation / Holiday / Rollover / No-Fault pay.',
  },
];

export const NDA_SECTIONS = [
  {
    heading: 'ARTICLE I — CONFIDENTIALITY',
    body:
      'All company information including but not limited to customer data, pricing structures, pay rates, revenue ' +
      'figures, internal systems, processes, and trade secrets are strictly confidential. You may not share, discuss, ' +
      'or disclose any company information to anyone outside of Clog Busterz LLC, including family members, friends, or ' +
      'other employers. This obligation continues in perpetuity after employment ends.',
  },
  {
    heading: 'ARTICLE II — NO SCREENSHOTS OR RECORDINGS',
    body:
      'Screenshots, photos, screen recordings, video recordings, and any form of capture of company sheets, systems, ' +
      'communications, or internal data are strictly prohibited at all times. This includes but is not limited to ' +
      'Google Sheets, emails, text messages, and any company software. Violation is grounds for immediate termination ' +
      'and legal action.',
  },
  {
    heading: 'ARTICLE III — MONITORING ACKNOWLEDGMENT',
    body:
      'Clog Busterz LLC monitors all activity on company devices, Google Sheets, and internal systems. All edits are ' +
      'logged with timestamps, user identity, and change details. This monitoring is ongoing, continuous, and ' +
      'non-negotiable. By signing this agreement you acknowledge and consent to this monitoring.',
  },
  {
    heading: 'ARTICLE IV — WATERMARK DISCLOSURE',
    body:
      'All company sheets contain invisible digital watermarks identifying the assigned user. Any leaked material will ' +
      'be traced to the source employee. Watermarks cannot be removed or altered. Attempting to remove watermarks is a ' +
      'separate violation of this agreement.',
  },
  {
    heading: 'ARTICLE V — COMPANY DEVICES & MONITORING CONSENT',
    body:
      'Company phones, tablets, tools, and equipment are company property and must be returned upon separation of ' +
      'employment. ALL communications on company-issued devices — including text messages, phone calls, emails, photos, ' +
      'browser history, and app usage — are monitored, recorded, reviewed, and stored by Clog Busterz LLC and/or ' +
      'automated systems including artificial intelligence. This monitoring is conducted for fraud prevention, policy ' +
      'enforcement, security, quality assurance, training, and legal compliance. Employee consents to this monitoring ' +
      'by signing this agreement and by using any company-issued device. Forwarding or sharing company communications ' +
      'is prohibited.',
  },
  {
    heading: 'ARTICLE VI — DRIVING POLICIES',
    body:
      'TEXTING AND DRIVING: ZERO TOLERANCE — IMMEDIATE TERMINATION. No warnings, no exceptions. Speeding policy follows ' +
      'Employee Handbook with tiered warnings up to termination. All driving events are monitored via fleet GPS ' +
      'telematics. Phone use while driving is tracked and reported.',
  },
  {
    heading: 'ARTICLE VII — COMPANY PHONES',
    body:
      'ALL customer communication must use company-issued phone. Personal calls to customers = write-up (1st), ' +
      'termination (2nd). All calls recorded via Clarity. Outbound + inbound monitored by AI.',
  },
  {
    heading: 'ARTICLE VIII — VIOLATION & PENALTIES',
    body:
      'Any violation of this Non-Disclosure Agreement is grounds for immediate termination and potential legal action ' +
      'including civil damages under Kentucky law. Violations are documented, non-negotiable, and enforced without ' +
      'exception. Confidentiality obligations are binding in perpetuity.',
  },
  {
    heading: 'ARTICLE IX — BREACH & INJUNCTIVE RELIEF',
    body:
      'The parties agree that breach of this agreement by Employee would cause harm to Clog Busterz LLC, and that, in ' +
      'addition to any monetary damages due, Employee agrees that injunctive relief would be appropriate and necessary. ' +
      'The parties agree that any dispute under this agreement should be subject to the jurisdiction of the Madison ' +
      'Circuit Court, and agree to subject themselves to and consent to that jurisdiction.',
  },
  {
    heading: 'ARTICLE X — CONSIDERATION',
    body:
      'For good and valuable consideration including but not limited to the sum of $10.00, the receipt and sufficiency ' +
      'of which is acknowledged, Employee agrees to be bound by this agreement.',
  },
];
