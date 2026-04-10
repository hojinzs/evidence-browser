export const dynamic = "force-dynamic";

import { listUsers } from "@/lib/db/users";
import { listWorkspaces } from "@/lib/db/workspaces";
import { UserList } from "@/components/admin/user-list";
import { WorkspaceManager } from "@/components/admin/workspace-manager";

export default async function AdminPage() {
  const users = listUsers();
  const workspaces = listWorkspaces();

  return (
    <div className="app-fade-up space-y-10">
      <section className="space-y-4">
        <div className="flex items-end gap-6">
          <div>
            <h2 className="text-xl font-semibold">User Management</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Manage access and permissions for workspace users.
            </p>
          </div>
          <div className="h-px flex-1 bg-border" />
        </div>
        <UserList users={users} />
      </section>

      <section className="space-y-4">
        <div className="flex items-end gap-6">
          <div>
            <h2 className="text-xl font-semibold">Workspace Management</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Create and configure evidence workspaces.
            </p>
          </div>
          <div className="h-px flex-1 bg-border" />
        </div>
        <WorkspaceManager workspaces={workspaces} />
      </section>
    </div>
  );
}
