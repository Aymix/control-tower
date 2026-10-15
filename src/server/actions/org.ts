"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orgSettings } from "@/db/schema";
import { audit } from "@/server/audit";
import { requireOwner } from "@/server/auth";
import { fail, ok, run, type ActionResult } from "./result";
import { RULES_CAP, getOrgSettings } from "@/server/queries/org";

const LABEL = { name: "Name", globalRules: "Global rules", guardrails: "Guardrails", styleGuide: "Style guide" } as const;

export async function updateOrgSettings(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireOwner();
    const fields = ["name", "globalRules", "guardrails", "styleGuide"] as const;
    const patch: Partial<Record<(typeof fields)[number], string>> = {};
    for (const f of fields) {
      const v = formData.get(f);
      if (typeof v === "string") {
        if (f !== "name" && v.length > RULES_CAP) return fail(`${LABEL[f]} is capped at ${RULES_CAP.toLocaleString()} characters.`);
        patch[f] = f === "name" ? v.trim() || "Control Tower" : v;
      }
    }
    await getOrgSettings();
    await db.update(orgSettings).set({ ...patch, updatedAt: new Date(), updatedBy: me.id }).where(eq(orgSettings.id, "org"));
    await audit({ actorId: me.id, action: "org.settings_updated", meta: { fields: Object.keys(patch) } });
    revalidatePath("/settings");
    return ok();
  });
}
