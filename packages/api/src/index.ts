import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth.js";
import { graphRoutes } from "./routes/graph.js";
import { learnRoutes } from "./routes/learn.js";
import { reviewRoutes } from "./routes/review.js";
import { progressRoutes } from "./routes/progress.js";
import { llmRoutes } from "./routes/llm.js";
import { familyRoutes } from "./routes/family.js";
import { adminRoutes } from "./routes/admin.js";
import { speechRoutes } from "./routes/speech.js";
import { settingsRoutes } from "./routes/settings.js";
import { publicRoutes } from "./routes/public.js";

export type Env = {
  Bindings: {
    DB: D1Database;
    AI?: Ai;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    OPENROUTER_API_KEY: string;
    OPENROUTER_MANAGEMENT_KEY?: string;
    ASSETS?: Fetcher;
  };
};

const app = new Hono<Env>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://learn.perrone.dev",
      "https://learn-platform-api-production.papetest.workers.dev",
    ],
    credentials: true,
  })
);

app.get("/", (c) => c.json({ status: "ok", service: "learn-platform-api" }));

// robots.txt — polite crawl directives for search engines and bots
app.get("/robots.txt", (c) => {
  const txt = [
    "User-agent: *",
    "Allow: /",
    "Allow: /explore/",
    "Allow: /how-we-teach",
    "Allow: /docs/",
    "Allow: /license",
    "",
    "# API rate limits apply — see /api/public/schema",
    "User-agent: *",
    "Crawl-delay: 2",
    "",
    "# Block aggressive scrapers from bulk API endpoints",
    "User-agent: CCBot",
    "User-agent: GPTBot",
    "User-agent: Google-Extended",
    "User-agent: ClaudeBot",
    "User-agent: anthropic-ai",
    "User-agent: Bytespider",
    "User-agent: ChatGPT-User",
    "Disallow: /api/",
    "",
    "Sitemap: https://learn.perrone.dev/sitemap.xml",
  ].join("\n");
  return c.text(txt, 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" });
});

app.route("/api/auth", authRoutes);
app.route("/api/graph", graphRoutes);
app.route("/api/learn", learnRoutes);
app.route("/api/review", reviewRoutes);
app.route("/api/progress", progressRoutes);
app.route("/api/llm", llmRoutes);
app.route("/api/family", familyRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/speech", speechRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/public", publicRoutes);

// SPA fallback — serve static assets / index.html for non-API routes
app.get("*", async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: "Not found", status: 404 }, 404);
});

// 404 handler (POST/PUT/DELETE to unknown routes)
app.notFound((c) =>
  c.json({ error: "Not found", status: 404 }, 404)
);

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      { error: err.message, status: err.status },
      err.status
    );
  }

  console.error("Unhandled error:", err);
  return c.json(
    { error: "Internal server error", status: 500 },
    500
  );
});

export default app;
