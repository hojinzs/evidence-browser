import { redirect } from "next/navigation";
import Link from "next/link";
import { getOptionalAuth } from "@/lib/auth/require-auth";
import { countAdmins } from "@/lib/db/users";
import { listWorkspacesWithBundleCount } from "@/lib/db/workspaces";
import { WorkspaceCard } from "@/components/workspace/workspace-card";
import { FolderOpen, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const adminCount = countAdmins();
  if (adminCount === 0) {
    redirect("/setup");
  }

  const user = await getOptionalAuth();
  if (!user) {
    redirect("/login");
  }

  const workspaces = listWorkspacesWithBundleCount();
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-4 py-3 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Evidence Browser</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm">
                  <Settings className="size-4 mr-1" />
                  관리
                </Button>
              </Link>
            )}
            <span className="text-xs text-muted-foreground">{user.username}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            워크스페이스 ({workspaces.length})
          </h2>
          {isAdmin && (
            <Link href="/admin">
              <Button variant="outline" size="sm">
                <Plus className="size-4 mr-1" />
                워크스페이스 추가
              </Button>
            </Link>
          )}
        </div>

        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="size-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">워크스페이스가 없습니다</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                slug={ws.slug}
                name={ws.name}
                description={ws.description}
                bundleCount={ws.bundle_count}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
