"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { BrandMark } from "./brand";

interface HeaderProps {
  title: string;
  filePath?: string | null;
  userName?: string | null;
  mobileTrigger?: ReactNode;
  backHref?: string;
  nav?: ReactNode;
}

export function Header({
  title,
  filePath,
  userName,
  mobileTrigger,
  backHref,
  nav,
}: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 h-12 shrink-0 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-full items-center gap-3 px-3 lg:px-6">
        <div className="flex shrink-0 items-center gap-2">
          {mobileTrigger && <div className="lg:hidden">{mobileTrigger}</div>}
          <Link href={backHref ?? "/"} className="hidden sm:block">
            <BrandMark compact />
          </Link>
        </div>

        <div className="hidden h-4 w-px bg-white/12 sm:block" />

        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-[20px] font-medium text-foreground sm:text-[13px] sm:font-normal sm:text-muted-foreground">
            {title}
          </h1>
          {filePath && (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">/</span>
              <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
                {filePath}
              </span>
            </>
          )}
        </div>

        {nav && <div className="hidden items-center gap-1 sm:flex">{nav}</div>}

        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0">
          {userName && (
            <span className="hidden text-[13px] text-muted-foreground sm:inline">{userName}</span>
          )}
          <Button variant="secondary" size="icon-sm" onClick={handleLogout} aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
