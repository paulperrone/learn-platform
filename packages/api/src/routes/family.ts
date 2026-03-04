import { Hono } from "hono";
import type { Context, Next } from "hono";
import { createAuth } from "../lib/auth.js";
import { getDb } from "../db/index.js";
import { createSRSService } from "../services/srs.js";
import * as schema from "../db/schema.js";
import { eq, and, gte, inArray } from "drizzle-orm";
import type { Env } from "../index.js";

type AuthUser = { id: string; name: string; email: string; role?: string | null };

type FamilyData = {
  organization: typeof schema.organizations.$inferSelect;
  membership: typeof schema.members.$inferSelect;
};

type FamilyEnv = Env & {
  Variables: {
    user: AuthUser;
    session: Record<string, unknown>;
    family: FamilyData;
  };
};

export const familyRoutes = new Hono<FamilyEnv>();

// --- Auth middleware: require authenticated user ---

familyRoutes.use("/*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user as AuthUser);
  c.set("session", session.session as Record<string, unknown>);
  await next();
});

// --- Helpers ---

async function getUserFamily(c: Context<FamilyEnv>, userId: string) {
  const db = getDb(c.env.DB);
  const membership = await db
    .select()
    .from(schema.members)
    .where(eq(schema.members.userId, userId))
    .limit(1);

  if (membership.length === 0) return null;

  const org = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, membership[0].organizationId))
    .limit(1);

  return org.length > 0
    ? { organization: org[0], membership: membership[0] }
    : null;
}

async function requireParent(c: Context<FamilyEnv>, next: Next) {
  const user = c.get("user");
  const family = await getUserFamily(c, user.id);
  if (!family || family.membership.role !== "owner") {
    return c.json({ error: "Forbidden: parent role required" }, 403);
  }
  c.set("family", family);
  await next();
}

// --- Family CRUD ---

// POST /api/family — create a new family (wraps org create)
familyRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { name } = await c.req.json<{ name: string }>();

  // Child accounts cannot create families
  const db = getDb(c.env.DB);
  const userRow = await db
    .select({ managedBy: schema.users.managedBy })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  if (userRow.length > 0 && userRow[0].managedBy) {
    return c.json({ error: "Child accounts cannot create families" }, 403);
  }

  if (!name || name.trim().length === 0) {
    return c.json({ error: "Family name is required" }, 400);
  }

  // Check if user already belongs to a family
  const existing = await getUserFamily(c, user.id);
  if (existing) {
    return c.json({ error: "User already belongs to a family" }, 409);
  }

  const auth = createAuth(c.env);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

  const org = await auth.api.createOrganization({
    body: { name, slug: uniqueSlug },
    headers: c.req.raw.headers,
  });

  return c.json({ family: org }, 201);
});

// GET /api/family — get current user's family
familyRoutes.get("/", async (c) => {
  const user = c.get("user");
  const family = await getUserFamily(c, user.id);
  if (!family) return c.json({ error: "No family found" }, 404);

  // Get all members with user info
  const db = getDb(c.env.DB);
  const memberRows = await db
    .select({
      memberId: schema.members.id,
      role: schema.members.role,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      birthYear: schema.users.birthYear,
      managedBy: schema.users.managedBy,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(eq(schema.members.organizationId, family.organization.id));

  return c.json({
    family: {
      id: family.organization.id,
      name: family.organization.name,
      slug: family.organization.slug,
      createdAt: family.organization.createdAt,
    },
    members: memberRows,
    currentUserRole: family.membership.role,
  });
});

// PUT /api/family — update family settings (parent only)
familyRoutes.put("/", requireParent, async (c) => {
  const family = c.get("family");
  const { name } = await c.req.json<{ name?: string }>();

  if (!name || name.trim().length === 0) {
    return c.json({ error: "Family name is required" }, 400);
  }

  const db = getDb(c.env.DB);
  await db
    .update(schema.organizations)
    .set({ name })
    .where(eq(schema.organizations.id, family.organization.id));

  return c.json({ success: true });
});

// --- Child Management ---

// POST /api/family/children — parent creates a child account
familyRoutes.post("/children", requireParent, async (c) => {
  const family = c.get("family");
  const user = c.get("user");

  const { name, email, password, birthYear } = await c.req.json<{
    name: string;
    email: string;
    password: string;
    birthYear?: number;
  }>();

  if (!name || !email || !password) {
    return c.json({ error: "name, email, and password are required" }, 400);
  }

  const auth = createAuth(c.env);

  // Create child user via admin plugin
  const child = await auth.api.createUser({
    body: {
      email,
      password,
      name,
      role: "user",
      data: {
        birthYear: birthYear ?? null,
        managedBy: user.id,
      },
    },
  });

  if (!child) {
    return c.json({ error: "Failed to create child account" }, 500);
  }

  const childUser = child.user;

  // Add child to family org as member
  const db = getDb(c.env.DB);
  const memberId = crypto.randomUUID();
  await db.insert(schema.members).values({
    id: memberId,
    userId: childUser.id,
    organizationId: family.organization.id,
    role: "member",
    createdAt: new Date().toISOString(),
  });

  return c.json({
    child: {
      id: childUser.id,
      name: childUser.name,
      email: childUser.email,
      birthYear: birthYear ?? null,
    },
  }, 201);
});

// GET /api/family/children — list children in family
familyRoutes.get("/children", requireParent, async (c) => {
  const family = c.get("family");
  const user = c.get("user");

  const db = getDb(c.env.DB);
  const children = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      birthYear: schema.users.birthYear,
      createdAt: schema.users.createdAt,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(
      and(
        eq(schema.members.organizationId, family.organization.id),
        eq(schema.users.managedBy, user.id)
      )
    );

  return c.json({ children });
});

// --- Parent Progress Views ---

// GET /api/family/children/:childId/progress — individual child progress
familyRoutes.get("/children/:childId/progress", requireParent, async (c) => {
  const family = c.get("family");
  const childId = c.req.param("childId");

  // Verify child is in this family
  const db = getDb(c.env.DB);
  const childMembership = await db
    .select()
    .from(schema.members)
    .where(
      and(
        eq(schema.members.userId, childId),
        eq(schema.members.organizationId, family.organization.id)
      )
    )
    .limit(1);

  if (childMembership.length === 0) {
    return c.json({ error: "Child not found in family" }, 404);
  }

  const srs = createSRSService(db);
  const stats = await srs.getUserStats(childId);

  const topicStates = await db
    .select()
    .from(schema.userTopicState)
    .where(eq(schema.userTopicState.userId, childId));

  return c.json({ childId, stats, topics: topicStates });
});

// GET /api/family/progress — aggregate progress for all children
familyRoutes.get("/progress", requireParent, async (c) => {
  const family = c.get("family");
  const user = c.get("user");

  const db = getDb(c.env.DB);

  // Get all children in family
  const children = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(
      and(
        eq(schema.members.organizationId, family.organization.id),
        eq(schema.users.managedBy, user.id)
      )
    );

  const srs = createSRSService(db);

  const childProgress = await Promise.all(
    children.map(async (child) => {
      const stats = await srs.getUserStats(child.userId);
      return {
        childId: child.userId,
        name: child.name,
        stats,
      };
    })
  );

  return c.json({ children: childProgress });
});

// --- Usage Tracking ---

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try { return JSON.parse(metadata); }
  catch { return {}; }
}

// GET /api/family/usage — aggregate LLM usage for all family children (current month)
familyRoutes.get("/usage", requireParent, async (c) => {
  const family = c.get("family");
  const user = c.get("user");
  const db = getDb(c.env.DB);

  // Get all children in family
  const children = await db
    .select({ userId: schema.users.id, name: schema.users.name })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(
      and(
        eq(schema.members.organizationId, family.organization.id),
        eq(schema.users.managedBy, user.id)
      )
    );

  const childIds = children.map((c) => c.userId);
  if (childIds.length === 0) {
    return c.json({ children: [], totalCostCents: 0, monthlyBudgetCents: null });
  }

  // Current month start (UTC)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const usageRows = await db
    .select()
    .from(schema.llmUsage)
    .where(
      and(
        inArray(schema.llmUsage.userId, childIds),
        gte(schema.llmUsage.createdAt, monthStart)
      )
    );

  // Aggregate per child
  const perChild = new Map<string, { costCents: number; calls: number }>();
  for (const id of childIds) perChild.set(id, { costCents: 0, calls: 0 });

  let totalCostCents = 0;
  for (const row of usageRows) {
    const entry = perChild.get(row.userId);
    if (entry) {
      entry.costCents += row.costCents;
      entry.calls++;
    }
    totalCostCents += row.costCents;
  }

  const meta = parseMetadata(family.organization.metadata);
  const monthlyBudgetCents = typeof meta.monthlyBudgetCents === "number" ? meta.monthlyBudgetCents : null;

  return c.json({
    children: children.map((child) => ({
      childId: child.userId,
      name: child.name,
      ...perChild.get(child.userId)!,
    })),
    totalCostCents,
    monthlyBudgetCents,
  });
});

// PUT /api/family/budget — set monthly LLM budget (parent only)
familyRoutes.put("/budget", requireParent, async (c) => {
  const family = c.get("family");
  const { monthlyBudgetCents } = await c.req.json<{ monthlyBudgetCents: number | null }>();

  if (monthlyBudgetCents !== null && (typeof monthlyBudgetCents !== "number" || monthlyBudgetCents < 0)) {
    return c.json({ error: "Budget must be a positive number or null to disable" }, 400);
  }

  const meta = parseMetadata(family.organization.metadata);
  if (monthlyBudgetCents === null) {
    delete meta.monthlyBudgetCents;
  } else {
    meta.monthlyBudgetCents = monthlyBudgetCents;
  }

  const db = getDb(c.env.DB);
  await db
    .update(schema.organizations)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organizations.id, family.organization.id));

  return c.json({ success: true, monthlyBudgetCents });
});

// GET /api/family/usage/check/:userId — check if a user has exceeded their family's LLM budget
familyRoutes.get("/usage/check/:userId", async (c) => {
  const targetUserId = c.req.param("userId");
  const db = getDb(c.env.DB);

  // Find user's family via managedBy → parent → org
  const userRow = await db
    .select({ managedBy: schema.users.managedBy })
    .from(schema.users)
    .where(eq(schema.users.id, targetUserId))
    .limit(1);

  // Not a managed child — no limit applies
  if (!userRow.length || !userRow[0].managedBy) {
    return c.json({ allowed: true });
  }

  const parentId = userRow[0].managedBy;

  // Find parent's org
  const parentMembership = await db
    .select({ organizationId: schema.members.organizationId })
    .from(schema.members)
    .where(eq(schema.members.userId, parentId))
    .limit(1);

  if (!parentMembership.length) {
    return c.json({ allowed: true });
  }

  const org = await db
    .select({ metadata: schema.organizations.metadata })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, parentMembership[0].organizationId))
    .limit(1);

  if (!org.length) return c.json({ allowed: true });

  const meta = parseMetadata(org[0].metadata);
  const budget = typeof meta.monthlyBudgetCents === "number" ? meta.monthlyBudgetCents : null;

  // No budget set — allowed
  if (budget === null) return c.json({ allowed: true });

  // Get all children in org
  const familyChildren = await db
    .select({ userId: schema.members.userId })
    .from(schema.members)
    .where(eq(schema.members.organizationId, parentMembership[0].organizationId));

  const childIds = familyChildren.map((m) => m.userId);

  // Current month usage
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const usageRows = await db
    .select({ costCents: schema.llmUsage.costCents })
    .from(schema.llmUsage)
    .where(
      and(
        inArray(schema.llmUsage.userId, childIds),
        gte(schema.llmUsage.createdAt, monthStart)
      )
    );

  const totalCostCents = usageRows.reduce((sum, r) => sum + r.costCents, 0);
  const allowed = totalCostCents < budget;

  return c.json({ allowed, totalCostCents, budgetCents: budget });
});
