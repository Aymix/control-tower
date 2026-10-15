"use client";
import { Fingerprint, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function PasskeyLogin({ next = "/inbox" }: { next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conditional UI (autofill) when the browser supports it.
  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential?.isConditionalMediationAvailable) return;
    void window.PublicKeyCredential.isConditionalMediationAvailable().then((ok) => {
      if (ok) void authClient.signIn.passkey({ autoFill: true }).then((r) => {
        if (r?.data) router.push(next);
      });
    });
  }, [router, next]);

  return (
    <div className="space-y-3">
      <input type="text" name="username" autoComplete="username webauthn" className="sr-only" aria-hidden tabIndex={-1} />
      <Button
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await authClient.signIn.passkey();
          setBusy(false);
          if (r?.error) setError(r.error.message ?? "Sign-in failed.");
          else {
            router.push(next);
            router.refresh();
          }
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
        Sign in with a passkey
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
