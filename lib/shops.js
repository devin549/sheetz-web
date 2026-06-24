// CB shop locations. Addresses come from env so Hank can hand out a real Maps link to the shop holding
// a tool/part. Set SHOP_RICHMOND_ADDRESS / SHOP_LEXINGTON_ADDRESS in Vercel (full street address). The
// shop labels work without them; only the map LINK needs the address.
export const SHOPS = [
  { id: 'richmond', label: 'Richmond Shop', address: process.env.SHOP_RICHMOND_ADDRESS || '' },
  { id: 'lexington', label: 'Lexington Shop', address: process.env.SHOP_LEXINGTON_ADDRESS || '' },
  { id: 'other', label: 'Other / Storage', address: process.env.SHOP_OTHER_ADDRESS || '' },
];

export const shopLabel = (id) => (SHOPS.find((s) => s.id === id) || {}).label || id || '';
export const shopAddress = (id) => (SHOPS.find((s) => s.id === id) || {}).address || '';

// Google Maps directions link to a destination address (opens turn-by-turn for whoever taps it).
export function mapsDir(destination) {
  const d = String(destination || '').trim();
  return d ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}` : '';
}
