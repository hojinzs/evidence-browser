import { redirect } from "next/navigation";
import Link from "next/link";
import { getOptionalAuth } from "@/lib/auth/require-auth";
import { countAdmins } from "@/lib/db/users";
import { listWorkspacesWithBundleCount } from "@/lib/db/workspaces";
import { WorkspaceCard } from "@/components/workspace/workspace-card";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout";
import { Card } from "@/components/ui/card";

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
      <Header
        title="Workspaces"
        userName={user.username}
        nav={
          <>
            <span className="rounded-md bg-white/7 px-3 py-2 text-[20px] font-medium text-foreground sm:text-[13px]">
              Workspaces
            </span>
            <span className="px-3 py-2 text-[13px] text-muted-foreground">Bundles</span>
            {isAdmin && (
              <Link href="/admin" className="px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground">
                Admin
              </Link>
            )}
          </>
        }
      />

      <main className="app-fade-up page-frame py-12">
        <div className="mb-7 flex items-end gap-6">
          <div>
            <h2 className="text-[20px] font-semibold">Workspaces</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Browse and manage your evidence workspaces.
            </p>
          </div>
          <div className="h-px flex-1 bg-border" />
          {isAdmin && (
            <Link href="/admin">
              <Button size="default">
                <Plus className="mr-1 size-4" />
                New Workspace
              </Button>
            </Link>
          )}
        </div>

        {workspaces.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">워크스페이스가 없습니다</Card>
        ) : (
          <Card className="overflow-hidden p-0">
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                slug={ws.slug}
                name={ws.name}
                description={ws.description}
                bundleCount={ws.bundle_count}
              />
            ))}
          </Card>
        )}
      </main>
    </div>
  );
}
