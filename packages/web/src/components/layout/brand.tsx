import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="relative block size-4 rounded-[5px] bg-primary">
        <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-white" />
      </span>
      <span className={cn("font-semibold text-foreground", compact ? "text-[14px]" : "text-[15px]")}>
        Evidence Browser
      </span>
    </div>
  );
}
