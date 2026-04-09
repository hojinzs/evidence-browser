import Link from "next/link";

import { cn } from "@/lib/utils";

interface SidebarNavItemProps {
  href?: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function SidebarNavItem({
  href,
  label,
  active,
  onClick,
}: SidebarNavItemProps) {
  const className = cn(
    "flex h-8 items-center rounded-md px-3 text-[13px] transition-colors duration-150",
    active
      ? "bg-white/7 text-foreground shadow-[inset_2px_0_0_0_var(--primary)]"
      : "text-muted-foreground hover:bg-white/4 hover:text-foreground"
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(className, "w-full text-left")}>
      {label}
    </button>
  );
}
