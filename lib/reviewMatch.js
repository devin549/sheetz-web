// Auto-match an incoming Google review to a tech so the watcher can MARK it without a human. Two signals:
// (1) the review TEXT names a tech (first name), (2) the AUTHOR matches a customer on a recent completed
// job → that job's tech. High confidence → assign + mark; low/none → leave for the office to assign.
// Pure (no I/O); the cron passes in the tech list + recent jobs.

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const firstName = (n) => lc(n).split(/\s+/)[0] || '';
const norm = (s) => lc(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// techs: [{ name }]. recentJobs: [{ tech_name, customer_name, completed_at }] (last ~30 days).
// Returns { techName, method, confidence } — method: 'named' | 'job' | null.
export function matchReview({ text = '', author = '', techs = [], recentJobs = [] }) {
  const body = norm(text);
  const names = techs.map((t) => t.name).filter(Boolean);

  // 1) Text names a tech. Prefer a full-name hit, else a distinct first-name hit (skip if two techs share it).
  const full = names.find((n) => n && body.includes(norm(n)));
  if (full) return { techName: full, method: 'named', confidence: 'high' };
  const firstCounts = {};
  names.forEach((n) => { const f = firstName(n); firstCounts[f] = (firstCounts[f] || 0) + 1; });
  const firstHit = names.find((n) => { const f = firstName(n); return f.length >= 3 && firstCounts[f] === 1 && new RegExp(`\\b${f}\\b`).test(body); });
  if (firstHit) return { techName: firstHit, method: 'named', confidence: 'high' };

  // 2) Author matches a recent job's customer → that job's tech.
  const a = norm(author);
  if (a) {
    const job = recentJobs.find((j) => j.customer_name && j.tech_name && norm(j.customer_name) === a);
    if (job) return { techName: job.tech_name, method: 'job', confidence: 'high' };
    // looser: author first+last initial overlap with a customer on a job
    const loose = recentJobs.find((j) => { const c = norm(j.customer_name); return j.tech_name && c && (c.startsWith(a) || a.startsWith(c)); });
    if (loose) return { techName: loose.tech_name, method: 'job', confidence: 'med' };
  }

  return { techName: null, method: null, confidence: 'none' };
}

// Stable id for a Google review so we never insert it twice (author + time, normalized).
export function reviewExternalId(author, timeSeconds, source = 'google') {
  return `${source}:${norm(author).replace(/ /g, '_')}:${timeSeconds || 0}`;
}
