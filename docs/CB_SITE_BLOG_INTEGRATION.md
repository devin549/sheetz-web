# Wire the CB website to the Sheetz blog (headless CMS)

The Sheetz app is now the blog CMS. You write/draft/publish posts in **Sheetz → Content Engine**, hit
**Publish**, and they're served at a public API. The CB site just fetches + renders them — so "Publish"
in Sheetz puts the post live on the site (after the site redeploys / revalidates).

## API (already live on the Sheetz app)
- `GET https://tech.sheetzz.com/api/blog` → `{ posts: [{ slug, title, keyword, town, excerpt, date }] }`
- `GET https://tech.sheetzz.com/api/blog/<slug>` → `{ title, town, keyword, markdown, date }`

(If your Sheetz app is on a different domain, use that instead. CORS is open.)

## Add to the CB site repo (Next.js App Router)

**1. Install a markdown renderer** (one-time): `npm install react-markdown`

**2. `app/blog/page.js`** — the blog index:
```jsx
export const revalidate = 300; // re-check every 5 min
const CMS = process.env.NEXT_PUBLIC_CMS_URL || 'https://tech.sheetzz.com';

export const metadata = { title: 'Plumbing Tips & Guides | Clog Busterz Plumbing' };

export default async function Blog() {
  let posts = [];
  try { const r = await fetch(`${CMS}/api/blog`, { next: { revalidate: 300 } }); posts = (await r.json()).posts || []; } catch {}
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px' }}>
      <h1>Plumbing Tips & Guides</h1>
      <p>Local advice from your Clog Busterz team.</p>
      <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        {posts.map((p) => (
          <a key={p.slug} href={`/blog/${p.slug}`} style={{ display: 'block', padding: 20, border: '1px solid #e5e5e5', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
            <h2 style={{ margin: 0 }}>{p.title}</h2>
            {p.town && <span style={{ fontSize: 13, color: '#c47f17' }}>📍 {p.town}</span>}
            <p style={{ color: '#555' }}>{p.excerpt}…</p>
          </a>
        ))}
        {posts.length === 0 && <p>New articles coming soon.</p>}
      </div>
    </main>
  );
}
```

**3. `app/blog/[slug]/page.js`** — a single post:
```jsx
import ReactMarkdown from 'react-markdown';
export const revalidate = 300;
const CMS = process.env.NEXT_PUBLIC_CMS_URL || 'https://tech.sheetzz.com';

export async function generateMetadata({ params }) {
  try { const p = await (await fetch(`${CMS}/api/blog/${params.slug}`)).json(); return { title: `${p.title} | Clog Busterz Plumbing`, description: p.title }; } catch { return {}; }
}

export default async function Post({ params }) {
  let post = null;
  try { const r = await fetch(`${CMS}/api/blog/${params.slug}`, { next: { revalidate: 300 } }); if (r.ok) post = await r.json(); } catch {}
  if (!post) return <main style={{ padding: 40 }}><a href="/blog">← Blog</a><p>Post not found.</p></main>;
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px', lineHeight: 1.7 }}>
      <a href="/blog" style={{ color: '#c47f17' }}>← All articles</a>
      {post.town && <div style={{ color: '#c47f17', marginTop: 16 }}>📍 {post.town}</div>}
      <ReactMarkdown>{post.markdown}</ReactMarkdown>
      <hr style={{ margin: '32px 0' }} />
      <p><strong>Need a plumber in {post.town || 'central Kentucky'}?</strong> Call <a href="tel:8594083382">(859) 408-3382</a> or book online.</p>
    </main>
  );
}
```

That's it. Publish in Sheetz → it appears at `clogbusterzplumbing.com/blog`. The 5-minute `revalidate` means new
posts show up within a few minutes without a manual redeploy.

## Schedule from the website → Sheetz (with the tech `?ref=` link)

The site's "Schedule" / "Book online" form POSTs to `https://tech.sheetzz.com/api/book`. It creates a job on
the dispatch board (status `hold` for the office to confirm a time) and records the tech's referral code, so
a booking from an employee's shared link credits that tech.

**Booking form** (any page; reads `?ref=` from the URL automatically):
```jsx
'use client';
import { useState } from 'react';
const CMS = process.env.NEXT_PUBLIC_CMS_URL || 'https://tech.sheetzz.com';

export default function BookForm() {
  const [done, setDone] = useState(null);
  async function submit(e) {
    e.preventDefault();
    const f = e.target;
    const ref = new URLSearchParams(location.search).get('ref') || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cb_ref')) || '';
    const body = { name: f.name.value, phone: f.phone.value, email: f.email.value, address: f.address.value, service: f.service.value, notes: f.notes.value, company: f.company.value, ref };
    const r = await fetch(`${CMS}/api/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    setDone(j.ok ? (j.message || "Thanks! We'll be in touch.") : (j.error || 'Something went wrong.'));
  }
  if (done) return <p style={{ padding: 20 }}>{done}</p>;
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
      <input name="name" placeholder="Your name" required />
      <input name="phone" placeholder="Phone" required />
      <input name="email" placeholder="Email (optional)" />
      <input name="address" placeholder="Service address" />
      <select name="service"><option>Drain cleaning</option><option>Water heater</option><option>Sewer / main line</option><option>Toilet / faucet</option><option>Other</option></select>
      {/* Qualifying questions → better quotes + dispatch */}
      <select name="location"><option value="">Where's the problem?</option><option>Kitchen</option><option>Bathroom</option><option>Basement</option><option>Garage</option><option>Outside / yard</option><option>Whole house</option><option>Not sure</option></select>
      <select name="homeAge"><option value="">How old is the home?</option><option>Under 10 yrs</option><option>10–30 yrs</option><option>30–50 yrs</option><option>50+ yrs</option><option>Not sure</option></select>
      <select name="urgency"><option value="">How urgent?</option><option>Emergency — now</option><option>Today / tomorrow</option><option>This week</option><option>Just a quote</option></select>
      <textarea name="notes" placeholder="What's going on?" rows={3} />
      {/* 📷 Optional: snap your water heater / unit label so we know the exact unit before we arrive */}
      <label>📷 Snap your unit's label (optional — gets you a faster, accurate quote)
        <input name="plateFile" type="file" accept="image/*" capture="environment" onChange={(e)=>{ const f=e.target.files?.[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ e.target.dataset.url = rd.result; }; rd.readAsDataURL(f); }} />
      </label>
      <input name="company" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />{/* honeypot — leave hidden */}
      <button type="submit">Request my appointment</button>
    </form>
  );
}
```
> In `submit`, also send the qualifiers + photo: add to `body` →
> `location: f.location.value, homeAge: f.homeAge.value, urgency: f.urgency.value, platePhoto: f.plateFile.dataset.url || ''`.
> The data-plate photo is OCR'd server-side (brand/model/fuel/age) and rides onto the job + the customer's
> equipment record — your office knows the exact unit before dispatch.

## "Ask Clog Busterz" assistant (customer brain)
A chat box powered by your real pricebook (prices shown as **"starting at"**, never a hard quote):
```jsx
'use client';
import { useState } from 'react';
const CMS = process.env.NEXT_PUBLIC_CMS_URL || 'https://tech.sheetzz.com';
export default function AskWidget() {
  const [q, setQ] = useState(''); const [a, setA] = useState(''); const [busy, setBusy] = useState(false);
  async function ask() { if (!q.trim()) return; setBusy(true); setA('');
    try { const r = await fetch(`${CMS}/api/ask`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ question: q }) }); setA((await r.json()).answer || ''); } catch { setA('Give us a call!'); }
    setBusy(false); }
  return (
    <div style={{ maxWidth: 480 }}>
      <input value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&ask()} placeholder="Ask us anything — e.g. cost to clear a drain?" style={{ width:'100%', padding:10 }} />
      <button onClick={ask} disabled={busy}>{busy?'Thinking…':'Ask'}</button>
      {a && <p style={{ background:'#f5f5f5', padding:12, borderRadius:8 }}>{a}</p>}
    </div>
  );
}
```
Put the same `?ref=` capture script (from the earlier chat) in the site `<head>` so the code survives page
clicks — then ANY page's form attributes correctly.

## Optional: instant publish (no wait)
Add a Vercel **Deploy Hook** for the site and have Sheetz ping it on publish — say the word and I'll wire the
Sheetz side to call your deploy hook so the post is live in seconds.
