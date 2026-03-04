import { Hono } from "hono";
import { createAuth } from "../lib/auth.js";
import type { Env } from "../index.js";

export const authRoutes = new Hono<Env>();

authRoutes.all("/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});
