import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/auth";

interface HeaderProps {
  title: string;
  userName?: string | null;
}

export function Header({ title, userName }: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <h1 className="text-sm font-semibold truncate">{title}</h1>
      <div className="flex items-center gap-3">
        {userName && (
          <span className="text-sm text-muted-foreground">{userName}</span>
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
