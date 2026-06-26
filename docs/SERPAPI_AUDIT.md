# SerpAPI Audit for Sheetz (Clog Busterz) — June 2026

You already pay ~$75/mo for SerpAPI and the key is wired (Vercel + local). This is every SerpAPI engine
that maps to a real Clog Busterz use case, prioritized by **revenue impact × build effort**. Status as of
this audit: **photos** (Shopping) and **Local Rank Tracker** (Local) are built; the rest are proposals.

## TIER 1 — Build now (field + growth, highest ROI)

| Feature | SerpAPI engine(s) | What it does for CB | Who uses it | Status |
|---|---|---|---|---|
| 📸 **Part Identifier** | Google Lens, Google Reverse Image | Tech photographs an unknown part/fixture → IDs it (brand/model) → where to buy + price → cross-checks your pricebook/shop stock. Pairs with the data-plate scanner. | **Tech (field)** | Proposed (next) |
| 📍 **Local Rank Tracker** | Google Local, Google Maps | Where CB ranks in the map pack per keyword × town. Richmond vs **Lexington** gap = #1 growth lever. Weekly heat-grid. | Owner/Marketing | **BUILT** |
| ⭐ **Review Intelligence** | Google Reviews, Google Maps Reviews | Auto-pull your Google reviews → match to the tech/job, alert on 1–3★, track competitors' star counts over time. | Office/Owner | Proposed (#2) |
| 🏢 **Commercial Lead Finder** | Google Maps, Google Local | Search "apartment complexes / property mgmt / restaurants" near you → name/phone/address list to work as B2B leads (you already run Summit, Vines, Lake Cumberland). | Office/Sales | Proposed (#3) |
| 🥷 **LSA + Competitor Spy** | Google Local Services, Google Local | Who's running Local Services Ads ("Google Guaranteed"), their rating/ad presence, who outranks you. Monitor your own LSA standing. | Owner/Marketing | Proposed (#4) |

## TIER 2 — Strong marketing + shop value

| Feature | SerpAPI engine(s) | What it does for CB | Who |
|---|---|---|---|
| 🛒 **Parts price + buy intel** | Home Depot (Search/Product), Walmart Product, Amazon Product, Google Shopping | "Where can I get this part NOW + cheapest?" for the shop; real retail cost to validate pricebook markup; product photos (✅ built). | Shop/Tech/Owner |
| 🔑 **SEO keyword research** | Google Autocomplete, Google Related Questions (People-Also-Ask), Google Trends | What customers actually type, the questions they ask (→ FAQ/blog content), and **seasonal demand** (freeze season → water heaters/frozen pipes) so you ramp marketing at the right time. | Marketing |
| 🌩️ **Demand-signal radar** | Google News, Google Events, Google Trends Trending Now | Cold snaps, water-main breaks, boil-water advisories → spike alerts ("frozen pipe calls incoming"); local events for community marketing. | Owner/Marketing |
| 🧑‍🔧 **Recruiting intel** | Google Jobs | Who's hiring plumbers near you + posted pay → set competitive wages; see where to post. | Owner/OM |

## TIER 3 — Niche / nice-to-have

| Feature | Engine(s) | Use |
|---|---|---|
| Yelp presence/competitors | Yelp (Search/Place/Reviews) | Track Yelp rating + competitor Yelp activity |
| GMB listing watch | Google Search (knowledge graph) | Alert if your Google business info (hours/phone) looks wrong |
| Competitor content | YouTube, Google Maps Photos | What competitors post; customer how-to content ideas |
| Secondary engines | Bing / DuckDuckGo Local | Presence beyond Google (low traffic share) |

## Recommended build order
1. **📸 Part Identifier** (Lens) — the one *techs* touch daily; immediate field value.
2. **⭐ Review Intelligence** (note: a Google-Place review watcher already exists via `lib/googleReviews` + `/api/cron/reviews`; SerpAPI can extend it to competitors).
3. **🏢 Commercial Lead Finder** — fills the B2B pipeline.
4. **🥷 LSA/Competitor Spy** + **🔑 SEO keyword research** — the marketing-domination pair.
5. **🛒 Parts price intel** + **🌩️ Demand radar** — shop + timing.

## Notes / guardrails
- One SerpAPI search = one credit; rank scan = ~72 (12 kw × 6 towns), lead finder ~1/search, part ID 1/photo.
  Keep crons weekly and field tools on-demand to stay under quota.
- Never expose raw competitor data to customers; this is internal intel only.
- Lead finder produces B2B *prospects* — outreach still goes through the no-auto-send approver gate.
