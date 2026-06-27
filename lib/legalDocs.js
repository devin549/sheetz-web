// legalDocs.js — Clog Busterz legal documents (Employee Handbook + NDA), shown in the onboarding flow and
// at /handbook + /nda. Extracted VERBATIM from the official PDFs Devin provided on 2026-06-27
// (CB_Handbook__06272026.pdf, NDA__20260627.pdf). Do not paraphrase — update by re-exporting from source.

export const HANDBOOK_INTRO =
  'This document summarizes the policies contained in the Clog Busterz Employee Handbook. By initialing each section and signing the acknowledgment, you confirm that you have reviewed the full handbook and agree to comply with all policies.';

export const HANDBOOK_SECTIONS = [
  { heading: '1. Employment At Will', body: 'Employment is at-will. Company reserves right to modify policies. Information is confidential per NDA.' },
  { heading: '2. Welcome', body: 'Welcome to Clog Busterz LLC. We emphasize trust, reliability, and high-quality workmanship.' },
  { heading: '3. Employee Orientation', body: 'New employees receive performance requirements and Company policy information. Falsification of documents may result in termination.' },
  { heading: '4. Equal Employment Opportunity', body: 'Company complies with all federal, state, and local EEO laws. No discrimination on any protected basis.' },
  { heading: '5. Anti-Discrimination & Harassment', body: 'Strictly prohibited. Report immediately. No retaliation. Violators subject to termination.' },
  { heading: '6. Safety Rules & Regulations', body: 'Safety is a condition of employment. Report all incidents immediately. OSHA compliance required.' },
  { heading: '7. 811 Before You Dig', body: 'All employees MUST comply with the Kentucky Underground Facility Damage Prevention Act (KRS 367.4901-367.4917). Before ANY excavation or digging you MUST call 811 at least 2 business days in advance. Failure to call 811 before digging is a violation of state law. If utility lines have NOT been marked, STOP WORK and contact your manager immediately.' },
  { heading: '8. Drug, Alcohol, and Contraband Policy', body: 'Zero tolerance for illegal substances on Company premises or vehicles. Random testing. Firearms prohibited except lawfully stored in locked personal vehicles.' },
  { heading: '9. Email and Internet Usage', body: 'No personal texting during work. All network traffic is Company property. No expectation of privacy. NDA covers all electronic communications.' },
  { heading: '10. Vehicle Policy', body: 'BUSINESS ONLY. No personal use, no passengers, no pets, no alcohol. TEXTING WHILE DRIVING = ZERO TOLERANCE = IMMEDIATE TERMINATION. Employee personally liable for driving with invalid license.' },
  { heading: '11. Company Technology & iPad Policy', body: 'Devices are Company property. No personal apps, no screenshots, no modifications. All data is confidential per NDA.' },
  { heading: '12. Gas Card & Fuel Policy', body: 'Business use only. Gas over 10% of revenue triggers review. Misuse = theft.' },
  { heading: '13. Solicitation', body: 'No solicitation by non-employees. Employees only during non-work time in non-work areas.' },
  { heading: '14. Company Property', body: 'No removal for personal use. Return all property upon termination including iPads, phones, tools, keys, gas cards.' },
  { heading: '15. Confidentiality of Internal Systems', body: 'All proprietary systems are trade secrets. No disclosure, screenshots, or copying. All sheets contain invisible digital watermarks traceable to the employee. NDA governs.' },
  { heading: '16. Termination', body: 'At-will. Final paycheck per KRS. Return all Company property on last day.' },
  { heading: '17. Attendance and Punctuality', body: 'Report punctually. Notify supervisor of absences. Excessive tardiness or absenteeism = disciplinary action.' },
  { heading: '18. On-Call & Holiday Policy', body: 'On-Call No-Show = forfeit holiday pay. Weekend Crew mandatory. 5 paid holidays per year.' },
  { heading: '19. Payroll Deduction & Clawback', body: 'Employee authorizes deductions for: callback penalties (50%/100%), equipment damage, unreturned property, gas card misuse, bonus clawback, overpayments, training costs (within 90 days). Minimum wage floor ($7.25/hr KY) always protected.' },
  { heading: '20. Receipt & Documentation Requirements', body: 'Submit same-day: receipts, photos, video, call recording. Pay held until documentation submitted. Fraudulent documentation = immediate termination.' },
  { heading: '21. Callback Policy', body: 'Tier 1 No Fault: no penalty. Tier 2 Half-Ass Work: 50% of original job pay deducted. Tier 3 Turd Job: 100% of original job pay deducted + mandatory 8AM meeting with manager. Materials on ALL callbacks charge the ORIGINAL tech. 2+ callbacks/week = ALL awards disqualified for the week. Callback counter tracked on your sheet — patterns trigger intervention.' },
  { heading: '22. Incentive & Awards Program', body: 'Discretionary. Corn Crown: $6,500+55% margin (commission) / $7,500+55% (salary). Golden Turd: $9,500+55% margin (commission) / $11,000+55% (salary). Crown Bonus: $150. Turd Bonus: $250. FloodBusterz: $225. Relines: $200/$400. BioOne: $20. All thresholds confidential per NDA.' },
  { heading: '23. Mandatory Mediation', body: 'Disputes submitted to mandatory mediation in Madison County, Kentucky per AAA rules. Costs shared equally.' },
  { heading: '24. Venue & Jurisdiction', body: 'Circuit Court of Madison County or U.S. District Court Eastern District of Kentucky.' },
  { heading: '25. Waiver of Jury Trial', body: 'EMPLOYEE AND COMPANY EACH WAIVE ALL RIGHTS TO JURY TRIAL for any action related to employment.' },
  { heading: '26. Attorneys Fees', body: 'Employee pays Company court costs and attorney fees if Company must litigate to enforce.' },
  { heading: '27. Governing Law', body: 'Commonwealth of Kentucky law without conflict of laws principles.' },
  { heading: '28. Management Verification', body: 'All infractions confirmed by manager. If manager lied to protect employee, BOTH are immediately terminated.' },
];

export const NDA_INTRO =
  'CONSIDERATION: For good and valuable consideration including but not limited to the sum of $10.00, the receipt and sufficiency of which is acknowledged, Employee agrees to be bound by this agreement.';

export const NDA_SECTIONS = [
  { heading: 'Article I — Parties', body: 'This Agreement is between Clog Busterz LLC ("Company") and ("Employee"). Employee has been granted access to the Company’s proprietary Tech Sheet system containing trade secrets and confidential business information.' },
  { heading: 'Article II — Confidential Information', body: 'Includes: compensation structures, financial data, customer information, employee performance data, proprietary business processes, and trade secrets per KRS 365.880.' },
  { heading: 'Article III — Non-Disclosure (Perpetual)', body: 'Employee shall NOT: disclose, screenshot, photograph, screen-record, copy, extract, post, or use any Confidential Information. This obligation survives in perpetuity.' },
  { heading: 'Article IV — Company Policies', body: '4.1 Incentive program (Corn Crown, Golden Turd). 4.2 Attendance (2+ unexcused = holiday pay forfeited, -5% commission). 4.3 Callbacks (No Fault, Half, Full, Turd Job). 4.4 Documentation (photos, video, calls required). 4.5 TEXTING WHILE DRIVING = ZERO TOLERANCE = IMMEDIATE TERMINATION.' },
  { heading: 'Article V — Company Phone', body: '5.1 Company Phone is sole property. 5.2 Employee consents to SMS. 5.3 Company monitors all content. NO expectation of privacy. 5.4 No forwarding/screenshots. 5.5 All messages are Company property.' },
  { heading: 'Article VI — On-Call', body: 'No-Show = forfeit holiday pay. Weekend Crew mandatory.' },
  { heading: 'Article VII — Remedies', body: 'Immediate termination, injunctive relief, monetary damages, forfeiture of bonuses, attorney fees per KRS 365.884.' },
  { heading: 'Article VIII — Return of Property', body: 'Upon separation: return all iPads, phones, uniforms, tools, keys. Delete all copies. KRS 337.060.' },
  { heading: 'Article IX — General', body: 'Kentucky law. Madison County or E.D. Kentucky venue. Severability. Confidentiality obligations survive in perpetuity.' },
  { heading: 'Article X — Breach & Injunctive Relief', body: 'The parties agree that breach of this agreement by Employee would cause harm to Clog Busterz LLC, and that, in addition to any monetary damages due, Employee agrees that injunctive relief would be appropriate and necessary. The parties agree that any dispute under this agreement should be subject to the jurisdiction of the Madison Circuit Court, and agree to subject themselves to and consent to that jurisdiction.' },
  { heading: 'Legally Binding', body: 'THIS IS A LEGALLY BINDING AGREEMENT. CONFIDENTIALITY OBLIGATIONS SURVIVE IN PERPETUITY. Digital execution per KRS 369.101.' },
];
