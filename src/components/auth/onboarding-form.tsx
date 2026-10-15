"use client";
import { Fingerprint, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

type Props = {
  endpoint: "/tower/setup" | "/tower/invite" | "/tower/recover";
  token?: string;
  requireSetupToken?: boolean;
  next: string;
  submitLabel: string;
  /** Recovery: no profile fields, just claim + add passkey. */
  skipProfile?: boolean;
};

export function OnboardingForm({ endpoint, token, requireSetupToken, next, submitLabel, skipProfile }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"profile" | "passkey">(skipProfile ? "passkey" : "profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");

  const claim = async (body: Record<string, string | undefined>) => {
    setBusy(true);
    setError(null);
    const r = await authClient.$fetch(endpoint, { method: "POST", body });
    setBusy(false);
    if (r.error) {
      setError((r.error as { message?: string }).message ?? "Something went wrong.");
      return false;
    }
    setClaimed(true);
    setStep("passkey");
    return true;
  };

  const addPasskey = async () => {
    setBusy(true);
    setError(null);
    if (!claimed && skipProfile) {
      const ok = await claim({ token });
      if (!ok) {
        setBusy(false);
        return;
      }
    }
    const r = await authClient.passkey.addPasskey({ name: passkeyName.trim() || undefined });
    setBusy(false);
    if (r?.error) {
      setError(r.error.message ?? "Passkey registration failed. You can retry.");
      return;
    }
    router.push(next);
    router.refresh();
  };

  if (step === "profile") {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await claim({
            name: String(fd.get("name") ?? ""),
            email: String(fd.get("email") ?? "") || undefined,
            token: token ?? (String(fd.get("token") ?? "") || undefined),
          });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required autoFocus placeholder="Amine" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">
            Email <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" />
        </div>
        {requireSetupToken ? (
          <div className="space-y-1.5">
            <Label htmlFor="token">Setup token</Label>
            <Input id="token" name="token" required placeholder="SETUP_TOKEN from the server" />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {skipProfile ? "Register a new passkey for this device." : "You're signed in. Register a passkey so you can sign in again later."}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="pkname">
          Passkey name <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="pkname" value={passkeyName} onChange={(e) => setPasskeyName(e.target.value)} placeholder="MacBook Touch ID" />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" onClick={addPasskey} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
        Register passkey
      </Button>
      {!skipProfile ? (
        <p className="text-xs text-muted-foreground">
          Without a passkey you will not be able to sign in again after this session. You can add more passkeys later under Account.
        </p>
      ) : null}
    </div>
  );
}
