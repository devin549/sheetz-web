// Build the drill-down category tree the CatalogBrowser renders, from flat categories + shaped items.
// Shared so the standalone /catalog and the in-job pricebook produce the IDENTICAL browse. Items must carry
// { id, categoryId, ... } (CatalogBrowser reads name/price/photo/description/marginHealth… off each).
import { artFor } from '@/lib/catalogArt';

const ICON = [[/water ?heater|tankless/i, '🔥'], [/drain|sewer|cabl|stoppage|rooter|main ?line/i, '🚿'], [/jett/i, '💦'], [/camera|locat|inspect/i, '📷'], [/toilet/i, '🚽'], [/kitchen/i, '🍴'], [/bath/i, '🛁'], [/faucet|fixture|sink|vanity/i, '🚰'], [/gas|line|pipe|repipe/i, '⛽'], [/pump|lift|sump|ejector/i, '💧'], [/hose ?bib|hydrant/i, '🌳'], [/septic/i, '🦠'], [/laundry/i, '🧺'], [/flood|water damage|mitigation|drying|demolition|restoration|content/i, '🌊'], [/member|club|plan|protection|warranty/i, '🛡️'], [/commercial|apartment|property|hospital/i, '🏢'], [/fee|after ?hours|trip|labor|dispatch/i, '🧾'], [/equipment/i, '🧰'], [/material/i, '📦'], [/template/i, '📋'], [/repair/i, '🔧'], [/residential/i, '🏠'], [/electric/i, '⚡']];
export const iconFor = (n) => { for (const [re, e] of ICON) if (re.test(n || '')) return e; return '🔧'; };

export function buildCatalogRoots(cats = [], shapedItems = []) {
  const byCat = {}; shapedItems.forEach((it) => { (byCat[it.categoryId] = byCat[it.categoryId] || []).push(it); });
  const childrenOf = {}; cats.forEach((c) => { const k = c.parent_id || 'root'; (childrenOf[k] = childrenOf[k] || []).push(c); });
  function build(cat) {
    const kids = (childrenOf[cat.id] || []).map(build).filter((n) => n.count > 0);
    const direct = byCat[cat.id] || [];
    if (kids.length === 1 && direct.length === 0) return kids[0]; // collapse single-child wrapper
    const node = { id: cat.id, label: cat.name, icon: iconFor(cat.name), art: artFor(cat.name), items: direct, children: kids };
    node.count = direct.length + kids.reduce((s, k) => s + k.count, 0);
    return node;
  }
  return (childrenOf['root'] || []).map(build).filter((n) => n.count > 0).sort((a, b) => b.count - a.count);
}
