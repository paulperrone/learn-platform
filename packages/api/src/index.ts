import { Hono } from "hono";
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

export default app;
