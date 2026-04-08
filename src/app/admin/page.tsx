import { listUsers } from "@/lib/db/users";
import { listWorkspaces } from "@/lib/db/workspaces";
import { UserList } from "@/components/admin/user-list";
import { WorkspaceManager } from "@/components/admin/workspace-manager";

export default async function AdminPage() {
  const users = listUsers();
  const workspaces = listWorkspaces();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">사용자 관리</h2>
        <UserList users={users} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">워크스페이스 관리</h2>
        <WorkspaceManager workspaces={workspaces} />
      </section>
    </div>
  );
}
