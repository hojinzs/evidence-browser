import Link from "next/link";
import { ChevronRight, FolderOpen } from "lucide-react";
import { workspaceUrl } from "@/lib/url";
import { Badge } from "@/components/ui/badge";

interface WorkspaceCardProps {
  slug: string;
  name: string;
  description: string;
  bundleCount: number;
  updatedLabel?: string;
}

export function WorkspaceCard({
  slug,
  name,
  description,
  bundleCount,
  updatedLabel,
}: WorkspaceCardProps) {
  return (
    <Link
      href={workspaceUrl(slug)}
      className="surface-card-hover flex h-16 items-center gap-3 border-b border-border px-4 last:border-b-0"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/6">
        <FolderOpen className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{name}</p>
        {description && (
          <p className="truncate text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      <Badge variant="neutral">{bundleCount} bundles</Badge>
      {updatedLabel && (
        <span className="hidden w-20 text-right text-xs text-[oklch(0.55_0_0)] md:block">
          {updatedLabel}
        </span>
      )}
      <ChevronRight className="size-4 text-[oklch(0.55_0_0)]" />
    </Link>
  );
}
