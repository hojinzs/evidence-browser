import { Link } from "@tanstack/react-router";
import { FileArchive, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BundleCardProps {
  title: string;
  bundleId: string;
  href: string;
  uploadedBy: string;
  createdAt: string;
  sizeBytes: number | null;
  canDelete?: boolean;
  isDeleting?: boolean;
  onDelete?: (bundleId: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}Z`);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BundleCard({
  title,
  bundleId,
  href,
  uploadedBy,
  createdAt,
  sizeBytes,
  canDelete = false,
  isDeleting = false,
  onDelete,
}: BundleCardProps) {
  const state = /fail|error/i.test(`${title} ${bundleId}`) ? "failed" : /pass|success/i.test(`${title} ${bundleId}`) ? "passed" : "bundle";

  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
      <Link to={href} className="surface-card-hover flex min-w-0 flex-1 items-center gap-4 rounded-lg">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/6">
          <FileArchive className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{title}</p>
          <p className="truncate text-[13px] text-muted-foreground">Uploaded by {uploadedBy}</p>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground md:block">
          {sizeBytes != null && <p>{formatSize(sizeBytes)}</p>}
          <p>{formatDate(createdAt)}</p>
        </div>
        <Badge variant={state === "passed" ? "green" : state === "failed" ? "red" : "neutral"}>{state}</Badge>
      </Link>
      {canDelete && onDelete ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(bundleId)}
          disabled={isDeleting}
          aria-label={`${bundleId} 삭제`}
          title="번들 삭제"
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}
