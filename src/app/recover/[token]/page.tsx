import { and, eq, isNull } from "drizzle-orm";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { db } from "@/db";
import { recoveryLink } from "@/db/schema";
import { hashToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function RecoverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await db.query.recoveryLink.findFirst({ where: and(eq(recoveryLink.tokenHash, hashToken(token)), isNull(recoveryLink.usedAt)) });
  const valid = link && link.expiresAt > new Date();
  if (!valid) {
    return (
      <AuthCard title="Recovery link not valid" description="This link was already used or has expired. Ask the owner for a new one.">
        <a className="text-sm underline" href="/login">Back to sign in</a>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Recover your account" description="This signs you in once so you can register a new passkey.">
      <OnboardingForm endpoint="/tower/recover" token={token} next="/account" submitLabel="Continue" skipProfile />
    </AuthCard>
  );
}
