import { requireHref } from '@/lib/guard';
import BarcodeClient from './BarcodeClient';

export const dynamic = 'force-dynamic';

export default async function Barcode() {
  await requireHref('/barcode');
  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">Barcode / Labels</div>
      <p className="muted">Type one label per line (SKU, bin, part name) → generate scannable Code-39 labels → print. Works with any cheap barcode scanner.</p>
      <BarcodeClient />
    </div>
  );
}
