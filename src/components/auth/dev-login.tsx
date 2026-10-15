"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DevLogin({ users }: { users: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!users.length) return null;
  return (
    <div className="mt-6 rounded-lg border border-dashed p-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">Dev login (DEV_LOGIN=1, never in production)</div>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <Button
            key={u.id}
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(u.id);
              await fetch("/api/auth/dev/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ userId: u.id }),
              });
              router.push("/inbox");
              router.refresh();
            }}
          >
            {u.name} <span className="text-muted-foreground">· {u.role}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
