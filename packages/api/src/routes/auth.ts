import { Hono } from "hono";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.js";
import type { Env } from "../index.js";

export const authRoutes = new Hono<Env>();

/**
 * D1 rejects Date objects — wrap the D1 binding with a Proxy that
 * intercepts prepared-statement `.bind()` calls and converts any
 * Date values to ISO strings before they reach the driver.
 */
function wrapD1(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (query: string) => {
          const stmt = target.prepare(query);
          return new Proxy(stmt, {
            get(s, p, r) {
              if (p === "bind") {
                return (...args: unknown[]) =>
                  s.bind(
                    ...args.map((a) =>
                      a instanceof Date ? a.toISOString() : a
                    )
                  );
              }
              return Reflect.get(s, p, r);
            },
          });
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function createAuth(env: Env["Bindings"]) {
  const db = drizzle(wrapD1(env.DB), { schema });
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
      },
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      "http://localhost:5173",
      "http://localhost:8787",
      "https://learn.perrone.dev",
      "https://learn-platform-api-production.papetest.workers.dev",
    ],
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        birthYear: { type: "number", required: false },
        managedBy: { type: "string", required: false },
      },
    },
    plugins: [
      organization(),
      admin(),
    ],
  });
}

authRoutes.all("/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});
