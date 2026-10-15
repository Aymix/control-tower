import { Radio } from "lucide-react";

export function AuthCard({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Radio className="size-4" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Control Tower</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-base font-semibold">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
