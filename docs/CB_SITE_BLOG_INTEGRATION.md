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

## Optional: instant publish (no wait)
Add a Vercel **Deploy Hook** for the site and have Sheetz ping it on publish — say the word and I'll wire the
Sheetz side to call your deploy hook so the post is live in seconds.
