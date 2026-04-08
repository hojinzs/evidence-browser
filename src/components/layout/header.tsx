"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  filePath?: string | null;
  userName?: string | null;
  mobileTrigger?: ReactNode;
}

export function Header({ title, filePath, userName, mobileTrigger }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-background px-2 lg:px-4 gap-2">
      {mobileTrigger && (
        <div className="lg:hidden shrink-0">{mobileTrigger}</div>
      )}

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <h1 className="text-sm font-semibold truncate">{title}</h1>
        {filePath && (
          <>
            <span className="text-muted-foreground text-xs hidden sm:inline">/</span>
            <span className="text-xs text-muted-foreground truncate hidden sm:inline font-mono">
              {filePath}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {userName && (
          <span className="text-xs text-muted-foreground hidden sm:inline">{userName}</span>
        )}
        <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
          <LogOut className="size-4" />
          <span className="sr-only">Logout</span>
        </Button>
      </div>
    </header>
  );
}
