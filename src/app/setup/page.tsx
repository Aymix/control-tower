import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isProd } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const owner = await db.query.user.findFirst({ where: eq(user.role, "owner") });
  if (owner) redirect("/login");
  return (
    <AuthCard
      title="Create the owner account"
      description="There are no accounts yet. The first account becomes the owner: the only person who talks to clients, approves Done and manages the team."
    >
      <OnboardingForm endpoint="/tower/setup" requireSetupToken={isProd()} next="/inbox" submitLabel="Create owner account" />
    </AuthCard>
  );
}
