import { Hono } from "hono";
import type { Env } from "../index.js";

export const reviewRoutes = new Hono<Env>();

reviewRoutes.get("/due", async (c) => {
  return c.json({ topics: [] });
});

reviewRoutes.post("/submit", async (c) => {
  return c.json({ message: "Not implemented" }, 501);
});
