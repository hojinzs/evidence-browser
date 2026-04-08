import Link from "next/link";
import { FileArchive } from "lucide-react";

interface BundleCardProps {
  title: string;
  bundleId: string;
  href: string;
  uploadedBy: string;
  createdAt: string;
  sizeBytes: number | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "Z");
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
}: BundleCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors"
    >
      <FileArchive className="size-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{bundleId}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground">{uploadedBy}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(createdAt)}
          {sizeBytes != null && ` · ${formatSize(sizeBytes)}`}
        </p>
      </div>
    </Link>
  );
}
