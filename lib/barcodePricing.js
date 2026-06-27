// Roll up an item's barcodes (each a vendor offering with a price) into avg / by-vendor / cheapest.
// One item, many barcodes → the cheapest vendor is what the shop sheet orders from.
export function priceStats(barcodes = []) {
  const priced = (barcodes || []).filter((b) => Number(b.unit_price) > 0);
  if (!priced.length) return { count: 0, avg: null, cheapest: null, byVendor: [] };
  // Best (lowest) price per vendor.
  const byV = {};
  priced.forEach((b) => {
    const v = (b.vendor_seller || 'Vendor').trim();
    const p = Number(b.unit_price);
    if (!byV[v] || p < byV[v].price) byV[v] = { vendor: v, price: p, url: b.vendor_url || null, barcode: b.barcode };
  });
  const byVendor = Object.values(byV).sort((a, b) => a.price - b.price);
  const avg = Math.round((priced.reduce((s, b) => s + Number(b.unit_price), 0) / priced.length) * 100) / 100;
  return { count: priced.length, avg, cheapest: byVendor[0] || null, byVendor };
}
