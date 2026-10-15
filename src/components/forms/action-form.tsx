"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/result";
import { cn } from "@/lib/utils";

type Props<T> = {
  action: (formData: FormData) => Promise<ActionResult<T>>;
  onSuccess?: (data: T | undefined, form: HTMLFormElement) => void;
  successMessage?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode | ((state: { pending: boolean }) => React.ReactNode);
};

/** Form that submits to a server action and toasts the result. */
export function ActionForm<T = undefined>({ action, onSuccess, successMessage, resetOnSuccess, className, children }: Props<T>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={cn(className)}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setError(null);
        start(async () => {
          const res = await action(fd);
          if (!res) return; // redirected
          if (res.ok) {
            if (successMessage) toast.success(successMessage);
            if (resetOnSuccess) form.reset();
            onSuccess?.(res.data, form);
            router.refresh();
          } else {
            setError(res.error);
            toast.error(res.error);
          }
        });
      }}
    >
      {typeof children === "function" ? children({ pending }) : children}
      {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
    </form>
  );
}
