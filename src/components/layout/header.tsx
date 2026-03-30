import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/auth";
import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  filePath?: string | null;
  userName?: string | null;
  /** Slot for the mobile sidebar toggle button */
  mobileTrigger?: ReactNode;
}

export function Header({ title, filePath, userName, mobileTrigger }: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-background px-2 lg:px-4 gap-2">
      {/* Mobile menu button slot */}
      {mobileTrigger && (
        <div className="lg:hidden shrink-0">{mobileTrigger}</div>
      )}

      {/* Title + file path */}
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

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        {userName && (
          <span className="text-xs text-muted-foreground hidden sm:inline">{userName}</span>
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="ghost" size="icon-sm" type="submit">
            <LogOut className="size-4" />
            <span className="sr-only">Logout</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
