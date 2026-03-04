import { Hono } from "hono";
import type { Env } from "../index.js";

export const learnRoutes = new Hono<Env>();

learnRoutes.post("/sessions", async (c) => {
  return c.json({ session: null, message: "Not implemented" }, 501);
});

learnRoutes.get("/sessions/:id", async (c) => {
  return c.json({ session: null, message: "Not implemented" }, 501);
});

learnRoutes.post("/sessions/:id/next", async (c) => {
  return c.json({ message: "Not implemented" }, 501);
});

learnRoutes.post("/sessions/:id/respond", async (c) => {
  return c.json({ message: "Not implemented" }, 501);
});
