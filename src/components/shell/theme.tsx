"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import { THEME_STORAGE_KEY as STORAGE_KEY } from "./theme-script";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    // Sync from the DOM class set by ThemeScript (external system → state).
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    queueMicrotask(read);
    return () => obs.disconnect();
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {}
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
