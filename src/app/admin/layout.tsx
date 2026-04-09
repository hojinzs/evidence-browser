import { requireAdmin } from "@/lib/auth/require-auth";
import { Header } from "@/components/layout";
import { SidebarNavItem } from "@/components/ui/sidebar-nav-item";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-background">
      <Header title="Admin" userName={user.username} />
      <div className="flex min-h-[calc(100vh-3rem)]">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar lg:block">
          <div className="px-4 py-6">
            <p className="eyebrow-label mb-3">Administration</p>
            <nav className="space-y-1">
              <SidebarNavItem label="Users" active />
              <SidebarNavItem label="Workspaces" />
              <SidebarNavItem label="Settings" />
              <SidebarNavItem label="Audit Log" />
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
