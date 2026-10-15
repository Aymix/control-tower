"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/actions/result";

type Props<T> = Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  action: () => Promise<ActionResult<T>>;
  confirm?: string;
  successMessage?: string;
  onSuccess?: (data: T | undefined) => void;
};

export function ActionButton<T = undefined>({ action, confirm: confirmMsg, successMessage, onSuccess, children, disabled, ...rest }: Props<T>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      {...rest}
      disabled={disabled || pending}
      onClick={() => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        start(async () => {
          const res = await action();
          if (!res) return;
          if (res.ok) {
            if (successMessage) toast.success(successMessage);
            onSuccess?.(res.data);
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      {children}
    </Button>
  );
}
