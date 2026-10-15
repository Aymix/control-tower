"use client";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function RulesField({
  name,
  label,
  hint,
  defaultValue,
  cap = 30_000,
  rows = 12,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  cap?: number;
  rows?: number;
}) {
  const [len, setLen] = useState(defaultValue.length);
  const over = len > cap;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={name}>{label}</Label>
        <span className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
          {len.toLocaleString()} / {cap.toLocaleString()}
        </span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <Textarea id={name} name={name} defaultValue={defaultValue} rows={rows} onChange={(e) => setLen(e.target.value.length)} className="font-mono text-[12.5px] leading-5" />
    </div>
  );
}
