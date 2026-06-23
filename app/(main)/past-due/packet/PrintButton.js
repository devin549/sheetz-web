'use client';

// One-click print → "Save as PDF" in the browser dialog. The packet page is print-styled
// (globals.css @media print hides the app chrome) so the PDF comes out clean.
export default function PrintButton() {
  return (
    <button className="no-print" onClick={() => window.print()}
      style={{ background: 'var(--amber)', color: '#1a1206', fontWeight: 800, border: 0, borderRadius: 9, padding: '9px 16px', fontSize: 14, cursor: 'pointer' }}>
      🖨️ Print / Save as PDF
    </button>
  );
}
