import Link from "next/link";
import { FolderOpen, Package } from "lucide-react";
import { workspaceUrl } from "@/lib/url";

interface WorkspaceCardProps {
  slug: string;
  name: string;
  description: string;
  bundleCount: number;
}

export function WorkspaceCard({ slug, name, description, bundleCount }: WorkspaceCardProps) {
  return (
    <Link
      href={workspaceUrl(slug)}
      className="flex items-start gap-3 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
    >
      <FolderOpen className="size-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground font-mono">{slug}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Package className="size-3.5" />
        {bundleCount}
      </div>
    </Link>
  );
}
