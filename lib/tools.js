// Tool registry with ALIAS learning — a field search like "seesnake" or "big reel" resolves to the right
// tool because the system remembers the names techs actually use. Fail-soft throughout.
const esc = (s) => String(s || '').replace(/[%,()]/g, ' ').trim();

export async function searchTools(sb, q) {
  try {
    const query = esc(q);
    let toolIds = null;
    if (query) {
      // Alias hits → tool ids, plus direct name/serial/category/identifier hits.
      let aliasIds = [];
      try { const { data } = await sb.from('tool_aliases').select('tool_id').ilike('alias', `%${query}%`); aliasIds = (data || []).map((a) => a.tool_id); } catch (_) {}
      const nr = await sb.from('tools').select('id').or(`name.ilike.%${query}%,serial.ilike.%${query}%,category.ilike.%${query}%,identifier.ilike.%${query}%`);
      const nameIds = nr.error ? [] : (nr.data || []).map((t) => t.id);
      toolIds = [...new Set([...aliasIds, ...nameIds])];
      if (!toolIds.length) return { available: true, tools: [] };
    }
    let tq = sb.from('tools').select('id, name, serial, mfg, year, value, assigned_to, status, condition_photo_url, category, identifier, holder_since').order('name', { ascending: true }).limit(120);
    if (toolIds) tq = tq.in('id', toolIds);
    const { data: tools, error } = await tq;
    if (error) return { available: false, tools: [] };
    // attach aliases
    const ids = (tools || []).map((t) => t.id);
    const aliasByTool = {};
    if (ids.length) { try { const { data } = await sb.from('tool_aliases').select('tool_id, alias').in('tool_id', ids); (data || []).forEach((a) => { (aliasByTool[a.tool_id] = aliasByTool[a.tool_id] || []).push(a.alias); }); } catch (_) {} }
    return { available: true, tools: (tools || []).map((t) => ({ ...t, aliases: aliasByTool[t.id] || [] })) };
  } catch { return { available: false, tools: [] }; }
}
