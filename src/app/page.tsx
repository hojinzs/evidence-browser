import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";

export default async function Home() {
  if (process.env.AUTH_BYPASS === "true") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 p-6 text-center">
          <div className="rounded-full bg-muted p-4">
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Evidence Browser</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bundle URL로 이동하세요.
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              /b/&#123;bundleId&#125;
            </p>
          </div>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            AUTH_BYPASS 활성화됨 (개발 모드)
          </p>
        </div>
      </div>
    );
  }

  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 p-6 text-center">
        <div className="rounded-full bg-muted p-4">
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Evidence Browser</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bundle URL로 이동하세요.
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            /b/&#123;bundleId&#125;
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {session.user?.name ?? session.user?.email ?? ""}
        </p>
      </div>
    </div>
  );
}
