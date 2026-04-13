"use client";

import { useState, type ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** File path shown below header on mobile only */
  filePath?: string | null;
}

/** Standalone trigger button to be placed in Header via mobileTrigger slot */
export function MobileSidebarTrigger({
  sidebar,
}: {
  sidebar: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <PanelLeft className="size-4" />
        <span className="sr-only">Toggle sidebar</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">File navigation</SheetTitle>
        <div className="h-full flex flex-col">{sidebar}</div>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({ sidebar, children, filePath }: AppShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:bg-sidebar">
        {sidebar}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile file path bar */}
        {filePath && (
          <div className="sm:hidden border-b border-border bg-sidebar px-3 py-1.5">
            <p className="text-xs font-mono text-muted-foreground truncate">
              {filePath}
            </p>
          </div>
        )}
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
