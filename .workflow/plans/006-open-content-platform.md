# Epic: Open Content Platform

> **Created:** 2026-03-05T01:07:44Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Make the entire learning catalog — knowledge graph, problems, worked examples, and pedagogy — publicly accessible to build trust and enable community audit. The content is free; only LLM/speech features that cost money are gated. Multiple access channels: public API, browsable web pages, downloadable content packs, and rich pedagogy documentation. Rate limiting protects infrastructure without gatekeeping knowledge.

## Progress

**Completed:** Phase 1, Phase 2, Phase 3, Phase 4
**In Progress:** —
**Next:** Phase 5

---

## Phase 1: Public Content API ✓
**Goal:** Unauthenticated REST endpoints for graph, topics, problems, and worked examples

1. [x] [IMP] Add public API routes (`/api/public/*`): subjects list, topics by subject, topic detail (with problems + examples), full graph structure (topics + edges). No auth required. Read-only queries against existing D1 tables.
2. [x] [IMP] Add Cloudflare rate limiting to public endpoints: use Workers rate limiting or `cf-connecting-ip` based throttle (e.g., 60 req/min per IP for API, 10 req/min for graph export). Return 429 with `Retry-After` header.
3. [x] [IMP] Add CORS headers for public API: allow `*` origin on `/api/public/*` routes so external tools and apps can consume the data directly from browsers.
4. [x] [IMP] Add OpenAPI-style JSON schema endpoint (`/api/public/schema`) documenting all public endpoints, request/response formats, and rate limits. Self-documenting API.
5. [x] [TST] Verify: curl public endpoints without auth → get correct JSON. Hit rate limit → get 429. CORS preflight works from external origin. Schema endpoint documents all routes.

**Validation:** External consumers can discover, understand, and query the full content catalog without authentication. Rate limiting prevents abuse without blocking legitimate use.

---

## Phase 2: "How We Teach" Page ✓
**Goal:** Integrated page explaining the learning science behind the platform

1. [x] [RSH] Draft content for the pedagogy page: mastery learning (cite Bloom 1984), spaced repetition (FSRS algorithm, cite Ebbinghaus/Bahrick/Kang), FIRe credit (how practicing a parent skill implicitly reviews children), worked example effect + fading (Sweller), self-explanation, pretesting, interleaving, confidence calibration. Write for parents — clear, not academic.
2. [x] [IMP] Build `/how-we-teach` Vue page: structured sections with visual aids (simple diagrams of the knowledge graph, example of SRS scheduling, hint progression). Link to actual problems/examples from the content to make it concrete.
3. [x] [IMP] Add SEO meta tags: title, description, Open Graph, structured data (FAQ schema for common parent questions like "Is this aligned to Common Core?", "How does AI tutoring work?", "Is my child's data safe?").
4. [x] [TST] Verify: page renders well on mobile and desktop, all links work, content is accurate and parent-friendly. Typecheck passes.

**Validation:** A parent landing on this page understands how the platform works, why it's effective, and why they should trust it. No jargon, concrete examples from real content.

---

## Phase 3: Public Content Browser ✓
**Goal:** SEO-friendly browsable pages showing the knowledge graph, topics, and problem banks

1. [x] [IMP] Build `/explore` page: subject cards with topic counts, descriptions, grade ranges. Entry point for browsing all content.
2. [x] [IMP] Build `/explore/:subjectId` page: visual topic list grouped by grade level, prerequisite arrows (simplified DAG view), mastery depth indicators. Show how topics connect.
3. [x] [IMP] Build `/explore/:subjectId/:topicId` page: topic name, description, grade level, standard alignment, sample problems with solutions, worked example previews. Full transparency into content quality.
4. [x] [IMP] Add SSR-friendly meta tags per page: dynamic `<title>`, `<meta description>`, Open Graph images for each topic. Social sharing should show topic name and preview.
5. [x] [TST] Verify: all explore pages render correct content, navigation between topics works, meta tags are present for SEO, pages work without JavaScript (SSR content), graph visualization is clear.

**Validation:** Anyone can browse the full curriculum, see every problem and example, and understand the prerequisite structure. Pages are indexable by search engines.

---

## Phase 4: Downloadable Content Packs ✓
**Goal:** Static JSON downloads for third-party use and community audit

1. [x] [IMP] Build content pack generator tool (`tools/generate-content-pack.ts`): bundles graph.json + all problems + all examples into a single versioned JSON file per subject. Include metadata (version, date, topic count, license).
2. [x] [IMP] Add download endpoint (`/api/public/download/:subject`): serves the pre-generated content pack as a JSON file with proper Content-Disposition headers. Cached at CDN edge.
3. [x] [IMP] Add content license and attribution: CC BY 4.0 or similar permissive license in the pack metadata and a `/license` page. Encourage reuse while requiring attribution.
4. [x] [TST] Verify: download works, file is valid JSON, contains all content, version metadata is correct. License is clear and permissive.

**Validation:** Anyone can download the complete curriculum data, use it in their own tools, and verify content quality independently. License terms are unambiguous.

---

## Phase 5: Detailed Pedagogy Documentation
**Goal:** Deep-dive docs with research references, methodology details, and design rationale

1. [ ] [RSH] Research and outline detailed articles: (1) "Why Mastery Learning Works" with Bloom's 2-sigma problem context, (2) "How Spaced Repetition Optimizes Memory" with FSRS algorithm explanation, (3) "The Knowledge Graph Approach" comparing to linear curricula, (4) "AI Tutoring Done Right" explaining Socratic method, hint progression, budget controls.
2. [ ] [IMP] Build `/docs` section with article pages: clean reading experience, code-free explanations with diagrams, links to academic papers, interactive examples where possible (e.g., "see how SRS schedules this topic").
3. [ ] [IMP] Add "Our Approach vs. Others" comparison: honest comparison with Khan Academy, MathAcademy, IXL — what we do differently and why. No marketing spin, just methodology differences.
4. [ ] [TST] Verify: all articles render correctly, citations link to actual papers, interactive examples work. Content is accurate and trustworthy.

**Validation:** A skeptical educator or parent can read the full methodology, check the research citations, and understand exactly how the platform works. Transparency builds trust.

---

## Phase 6: Abuse Protection & Monitoring
**Goal:** Protect public endpoints from scraping, LLM polling, and DDoS without blocking legitimate users

1. [ ] [IMP] Add bot detection middleware: identify LLM scrapers and mass crawlers via User-Agent patterns, request frequency, and payload patterns. Serve `robots.txt` with polite crawl directives. Allow legitimate bots (Google, Bing) while throttling aggressive ones.
2. [ ] [IMP] Add request logging for public endpoints: track request counts per IP/endpoint, response times, error rates. Store in D1 or Workers Analytics. No PII logged.
3. [ ] [IMP] Add Cloudflare WAF rules: configure Page Rules or WAF custom rules for the public API paths — challenge suspicious patterns, block known bad actors, rate limit by IP+path combination.
4. [ ] [TST] Verify: normal browsing works smoothly, rapid scraping gets throttled, robots.txt is served, analytics show meaningful data. No false positives blocking parents or educators.

**Validation:** Public content is genuinely accessible to humans and reasonable bots. Abuse is detected and throttled. Platform stays responsive under load.
