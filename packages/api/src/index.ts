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

export type Env = {
  Bindings: {
    DB: D1Database;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    OPENROUTER_API_KEY: string;
    ASSETS?: Fetcher;
  };
};

const app = new Hono<Env>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "https://learn.perrone.dev"],
    credentials: true,
  })
);

app.get("/", (c) => c.json({ status: "ok", service: "learn-platform-api" }));

app.route("/auth", authRoutes);
app.route("/api/graph", graphRoutes);
app.route("/api/learn", learnRoutes);
app.route("/api/review", reviewRoutes);
app.route("/api/progress", progressRoutes);
app.route("/api/llm", llmRoutes);

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
