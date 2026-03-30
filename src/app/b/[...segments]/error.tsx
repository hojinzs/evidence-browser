"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BundleError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Bundle error:", error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-4">
      <AlertTriangle className="size-12 text-destructive" />
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">오류가 발생했습니다</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message || "번들을 로드하는 중 문제가 발생했습니다."}
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
