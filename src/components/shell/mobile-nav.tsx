"use client";
import { Menu, Radio } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Workspace } from "@/db/schema";

export function MobileNav({ workspaces, isOwner }: { workspaces: Pick<Workspace, "id" | "slug" | "name">[]; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden flex items-center gap-2 border-b h-12 px-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4" /> Control Tower
          </SheetTitle>
          <nav className="mt-4 flex flex-col gap-1 text-sm" onClick={() => setOpen(false)}>
            <Link href="/inbox" className="px-2 py-1.5 rounded hover:bg-accent">Inbox</Link>
            <Link href="/account" className="px-2 py-1.5 rounded hover:bg-accent">Account</Link>
            {isOwner ? <Link href="/settings" className="px-2 py-1.5 rounded hover:bg-accent">Settings</Link> : null}
            <div className="mt-3 px-2 text-[11px] uppercase tracking-wider text-muted-foreground">Workspaces</div>
            {workspaces.map((w) => (
              <Link key={w.id} href={`/w/${w.slug}`} className="px-2 py-1.5 rounded hover:bg-accent">
                {w.name}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
      <Link href="/inbox" className="font-semibold">Control Tower</Link>
    </div>
  );
}
