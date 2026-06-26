// Best-tech recommender — for a given slot + job, rank the techs who are working and free, by skill match,
// proximity, and lightest load. Pure (no I/O). Degrades gracefully when skills/area data is absent (load-only).
const norm = (s) => String(s || '').toLowerCase();

// techs: [{ id, name, skills?:[], area?:'Richmond' }]. busyTechIds: Set of techs already booked in the window.
// techLoad: { techId: jobsToday } for tie-breaking by who's lightest.
export function rankTechs(techs = [], { jobType = '', city = '', busyTechIds = new Set(), techLoad = {} } = {}) {
  const jt = norm(jobType);
  return techs
    .filter((t) => !busyTechIds.has(t.id))
    .map((t) => {
      let score = 0; const reasons = [];
      const skills = norm((t.skills || []).join(' '));
      if (skills && jt && (t.skills || []).some((s) => s && jt.includes(norm(s)))) { score += 5; reasons.push('skill match'); }
      if (t.area && city && norm(t.area).includes(norm(city).split(' ')[0])) { score += 3; reasons.push('nearby'); }
      const load = techLoad[t.id] || 0;
      score += Math.max(0, 6 - load);  // lighter load = higher score
      return { tech: t, score, load, reasons };
    })
    .sort((a, b) => b.score - a.score || a.load - b.load);
}

export function bestTech(techs, opts) { const r = rankTechs(techs, opts); return r[0] || null; }

// How many techs are free in a window = working techs minus those already booked in it.
export function freeCount(workingTechs, bookedTechIds) {
  const busy = bookedTechIds instanceof Set ? bookedTechIds : new Set(bookedTechIds || []);
  return Math.max(0, workingTechs - busy.size);
}
