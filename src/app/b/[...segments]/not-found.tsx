import { FileX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BundleNotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-4">
      <FileX className="size-12 text-muted-foreground/50" />
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">찾을 수 없습니다</h2>
        <p className="text-sm text-muted-foreground">
          요청한 번들 또는 파일을 찾을 수 없습니다.
        </p>
      </div>
      <Link href="/">
        <Button variant="outline">홈으로 돌아가기</Button>
      </Link>
    </div>
  );
}
