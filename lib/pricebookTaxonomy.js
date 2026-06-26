// Curated catalog tree for the immersive Pricebook browser. A PRESENTATION layer over the raw imported
// items — each item is auto-bucketed by keyword into a clean tree (Water Heater → Gas/Electric/Tankless …),
// so the messy ST categories stay out of the customer/tech's way. Tweak the rules here; nothing re-imports.

// Each node: { id, label, icon, kw (RegExp matcher), children? }. Children are tried in order; a node with
// kw:/.*/ is the catch-all for its level. Top nodes are tried in order, so put specific before generic.
export const TAXONOMY = [
  { id: 'water-heater', label: 'Water Heater', icon: '🔥', kw: /water ?heater|tankless|\bheater\b|water htr|w\/h\b/i, children: [
    { id: 'wh-tankless', label: 'Tankless', icon: '♨️', kw: /tankless|on[- ]?demand/i },
    { id: 'wh-gas', label: 'Gas', icon: '🔥', kw: /\bgas\b|fuel ?fired|natural gas|propane|\blp\b/i },
    { id: 'wh-electric', label: 'Electric', icon: '⚡', kw: /electric|heat ?pump|hybrid/i },
    { id: 'wh-repair', label: 'Repairs & Parts', icon: '🔧', kw: /repair|element|thermostat|anode|t&p|relief|flush|expansion|pan\b/i },
    { id: 'wh-other', label: 'More Water Heater', icon: '•', kw: /.*/ },
  ] },
  { id: 'drain', label: 'Drain & Sewer', icon: '🚿', kw: /drain|sewer|clog|cabl|rooter|stoppage|backup|snake|auger|jett|main ?line/i, children: [
    { id: 'dr-jet', label: 'Hydro Jetting', icon: '💦', kw: /jett|hydro/i },
    { id: 'dr-main', label: 'Main Line', icon: '🕳️', kw: /main ?line|main sewer|main drain/i },
    { id: 'dr-clean', label: 'Drain Cleaning', icon: '🚿', kw: /drain|clog|cabl|snake|auger|stoppage|backup|rooter/i },
    { id: 'dr-other', label: 'More Drain', icon: '•', kw: /.*/ },
  ] },
  { id: 'camera', label: 'Camera & Locate', icon: '📷', kw: /camera|inspect|locat|seesnake|see ?snake/i },
  { id: 'toilet', label: 'Toilet', icon: '🚽', kw: /toilet|commode|flush|wax ring|flapper|fill valve|flange/i, children: [
    { id: 'to-replace', label: 'Replace', icon: '🆕', kw: /replace|install|new toilet/i },
    { id: 'to-repair', label: 'Repair & Parts', icon: '🔧', kw: /repair|flapper|fill valve|wax|flange|reset|rebuild|tank/i },
    { id: 'to-other', label: 'More Toilet', icon: '•', kw: /.*/ },
  ] },
  { id: 'faucet', label: 'Faucet & Fixtures', icon: '🚰', kw: /faucet|fixture|sink|vanity|shower|tub|spout|valve|disposal|garbage/i, children: [
    { id: 'fa-kitchen', label: 'Kitchen', icon: '🍴', kw: /kitchen|disposal|garbage/i },
    { id: 'fa-bath', label: 'Bath', icon: '🛁', kw: /bath|shower|tub|vanity|lav/i },
    { id: 'fa-other', label: 'More Fixtures', icon: '•', kw: /.*/ },
  ] },
  { id: 'gas-line', label: 'Gas & Lines', icon: '⛽', kw: /gas line|gas pipe|gas\b|water line|repipe|re-?pipe|supply line|pex|copper/i },
  { id: 'pump', label: 'Pumps', icon: '💧', kw: /pump|sump|ejector|grinder|well\b|booster/i },
  { id: 'hose-bib', label: 'Hose Bib & Outdoor', icon: '🌳', kw: /hose ?bib|hydrant|spigot|sillcock|outdoor|frost/i },
  { id: 'backflow', label: 'Backflow & Water Quality', icon: '🧪', kw: /backflow|softener|filter|ro\b|reverse osmosis|water quality|conditioner/i },
  { id: 'excavation', label: 'Excavation & Repair', icon: '⛏️', kw: /excavat|dig|trench|spot repair|liner|reline|burst|dirt/i },
  { id: 'flood', label: 'Flood Busterz', icon: '🌊', kw: /flood|mitigation|drying|demolition|restoration|extraction|mold|water damage|content/i },
  { id: 'membership', label: 'Memberships & Plans', icon: '🛡️', kw: /member|club|plan|contract|maintenance|agreement/i },
  { id: 'commercial', label: 'Commercial & Accounts', icon: '🏢', kw: /apartment|commercial|property|hospital|saddle ?brooke|summit|patchen|vines|upscale|unit turn/i },
  { id: 'fees', label: 'Trip & Fees', icon: '🧾', kw: /trip|truck charge|fee|diagnostic|service call|after ?hours|dispatch|labor\b/i },
  { id: 'other', label: 'Everything Else', icon: '🔧', kw: /.*/ },
];

const textOf = (item) => [item.name, item.customer_name, item.category_name, (item.job_types || []).join(' '), (item.tags || []).join(' ')].filter(Boolean).join(' ').toLowerCase();

// Return the [topId, leafId] path for an item (leafId === topId when a top node has no children).
export function pathFor(item) {
  const t = textOf(item);
  const top = TAXONOMY.find((n) => n.kw.test(t)) || TAXONOMY[TAXONOMY.length - 1];
  if (!top.children) return [top.id, top.id];
  const leaf = top.children.find((c) => c.kw.test(t)) || top.children[top.children.length - 1];
  return [top.id, leaf.id];
}

// Build the tree with item counts (and optionally the items) bucketed in. Returns top nodes with
// { ...node, count, children:[{...child, count, items?}] } — items attached only at leaves.
export function classify(items = [], { attachItems = false } = {}) {
  const byTop = {}; const byLeaf = {};
  for (const it of items) { const [topId, leafId] = pathFor(it); (byTop[topId] = byTop[topId] || []).push(it); (byLeaf[leafId] = byLeaf[leafId] || []).push(it); }
  const node = (n, leaf) => {
    const items = (leaf ? byLeaf[n.id] : byTop[n.id]) || [];
    const base = { id: n.id, label: n.label, icon: n.icon, count: items.length };
    if (n.children) base.children = n.children.map((c) => node(c, true)).filter((c) => c.count > 0);
    else if (attachItems) base.items = items;
    return base;
  };
  return TAXONOMY.map((n) => node(n, false)).filter((n) => n.count > 0);
}
