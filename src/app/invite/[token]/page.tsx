import { and, eq, isNull } from "drizzle-orm";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { db } from "@/db";
import { invite } from "@/db/schema";
import { hashToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.query.invite.findFirst({ where: and(eq(invite.tokenHash, hashToken(token)), isNull(invite.usedAt)) });
  const valid = inv && inv.expiresAt > new Date();
  if (!valid) {
    return (
      <AuthCard title="Invite not valid" description="This invite link was already used, revoked, or has expired. Ask the owner for a new one." >
        <a className="text-sm underline" href="/login">Back to sign in</a>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Join Control Tower" description={inv.label ? `Invite: ${inv.label}` : "Create your account, then register a passkey."}>
      <OnboardingForm endpoint="/tower/invite" token={token} next="/inbox" submitLabel="Create account" />
    </AuthCard>
  );
}
