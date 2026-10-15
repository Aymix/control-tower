import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { DevLogin } from "@/components/auth/dev-login";
import { PasskeyLogin } from "@/components/auth/passkey-login";
import { db } from "@/db";
import { user } from "@/db/schema";
import { devLoginEnabled } from "@/lib/env";
import { getCurrentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getCurrentUser();
  if (me) redirect("/inbox");
  const owner = await db.query.user.findFirst({ where: eq(user.role, "owner") });
  if (!owner) redirect("/setup");
  const { next } = await searchParams;
  const devUsers = devLoginEnabled()
    ? await db.query.user.findMany({ columns: { id: true, name: true, role: true }, orderBy: (u, { asc }) => [asc(u.createdAt)] })
    : [];
  return (
    <AuthCard title="Sign in" description="Use the passkey you registered on this device.">
      <PasskeyLogin next={next && next.startsWith("/") ? next : "/inbox"} />
      <p className="text-xs text-muted-foreground mt-4">
        Locked out? Ask the owner for a recovery link. New here? You need an invite link.
      </p>
      <DevLogin users={devUsers} />
    </AuthCard>
  );
}
