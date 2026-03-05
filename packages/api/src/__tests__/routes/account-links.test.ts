import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  resetDb,
  seedUser,
  seedAccountLink,
  getTestDb,
} from "../helpers.js";
import * as schema from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

describe("Account Links", () => {
  beforeAll(async () => {
    await resetDb();
    await applyMigrations();
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(schema.accountLinks);
  });

  describe("account_links table", () => {
    it("creates a link between two users", async () => {
      const parent = await seedUser({ name: "Parent" });
      const child = await seedUser({ name: "Child" });

      const link = await seedAccountLink(parent.id, child.id, "parent");
      expect(link.fromUserId).toBe(parent.id);
      expect(link.toUserId).toBe(child.id);
      expect(link.type).toBe("parent");
      expect(link.status).toBe("active");
    });

    it("prevents duplicate links (same from, to, type)", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const student = await seedUser({ name: "Student" });

      await seedAccountLink(teacher.id, student.id, "teacher");

      await expect(
        seedAccountLink(teacher.id, student.id, "teacher")
      ).rejects.toThrow();
    });

    it("allows different link types between same users", async () => {
      const user1 = await seedUser({ name: "User1" });
      const user2 = await seedUser({ name: "User2" });

      const link1 = await seedAccountLink(user1.id, user2.id, "teacher");
      const link2 = await seedAccountLink(user1.id, user2.id, "tutor");

      expect(link1.type).toBe("teacher");
      expect(link2.type).toBe("tutor");
    });

    it("supports revoking a link", async () => {
      const parent = await seedUser({ name: "Parent" });
      const child = await seedUser({ name: "Child" });

      const link = await seedAccountLink(parent.id, child.id, "parent");

      const db = getTestDb();
      await db
        .update(schema.accountLinks)
        .set({ status: "revoked" })
        .where(eq(schema.accountLinks.id, link.id));

      const [updated] = await db
        .select()
        .from(schema.accountLinks)
        .where(eq(schema.accountLinks.id, link.id));

      expect(updated.status).toBe("revoked");
    });

    it("queries links by user (both directions)", async () => {
      const teacher = await seedUser({ name: "Teacher" });
      const student1 = await seedUser({ name: "Student 1" });
      const student2 = await seedUser({ name: "Student 2" });

      await seedAccountLink(teacher.id, student1.id, "teacher");
      await seedAccountLink(teacher.id, student2.id, "teacher");

      const db = getTestDb();

      // Teacher's outgoing links
      const teacherLinks = await db
        .select()
        .from(schema.accountLinks)
        .where(eq(schema.accountLinks.fromUserId, teacher.id));
      expect(teacherLinks).toHaveLength(2);

      // Student's incoming links
      const studentLinks = await db
        .select()
        .from(schema.accountLinks)
        .where(eq(schema.accountLinks.toUserId, student1.id));
      expect(studentLinks).toHaveLength(1);
      expect(studentLinks[0].type).toBe("teacher");
    });

    it("filters active links only", async () => {
      const parent = await seedUser({ name: "Parent" });
      const child = await seedUser({ name: "Child" });

      await seedAccountLink(parent.id, child.id, "parent", { status: "active" });
      const guardian = await seedUser({ name: "Guardian" });
      await seedAccountLink(guardian.id, child.id, "guardian", { status: "revoked" });

      const db = getTestDb();
      const activeLinks = await db
        .select()
        .from(schema.accountLinks)
        .where(
          and(
            eq(schema.accountLinks.toUserId, child.id),
            eq(schema.accountLinks.status, "active")
          )
        );

      expect(activeLinks).toHaveLength(1);
      expect(activeLinks[0].type).toBe("parent");
    });
  });
});
