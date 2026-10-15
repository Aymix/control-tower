import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgSettings } from "@/db/schema";

export const RULES_CAP = 30_000;

export async function getOrgSettings() {
  const row = await db.query.orgSettings.findFirst({ where: eq(orgSettings.id, "org") });
  if (row) return row;
  const [created] = await db.insert(orgSettings).values({ id: "org" }).onConflictDoNothing().returning();
  return created ?? (await db.query.orgSettings.findFirst({ where: eq(orgSettings.id, "org") }))!;
}
