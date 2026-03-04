import { Hono } from "hono";
import type { Env } from "../index.js";

export const llmRoutes = new Hono<Env>();

llmRoutes.post("/evaluate", async (c) => {
  return c.json({ message: "Not implemented" }, 501);
});

llmRoutes.post("/tutor", async (c) => {
  return c.json({ message: "Not implemented" }, 501);
});

llmRoutes.get("/usage", async (c) => {
  return c.json({ totalCostCents: 0, breakdown: [] });
});
