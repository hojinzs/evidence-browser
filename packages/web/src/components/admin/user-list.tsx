import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { UserPublic } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface UserListProps {
  users: UserPublic[];
}

const selectClassName =
  "h-9 rounded-lg border border-input bg-black/30 px-3 text-[13px] text-foreground outline-none transition-colors duration-150 focus:border-primary focus:ring-3 focus:ring-ring";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export function UserList({ users }: UserListProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshUsers() {
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.createUser({ username, password, role });
      setShowForm(false);
      setUsername("");
      setPassword("");
      setRole("user");
      await refreshUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("사용자를 삭제하시겠습니까?")) return;
    try {
      await api.deleteUser(id);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    }
  }

  async function handleToggleRole(id: string, currentRole: UserPublic["role"]) {
    setError("");
    try {
      const nextRole = currentRole === "admin" ? "user" : "admin";
      await api.updateUserRole(id, nextRole);
      await refreshUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    }
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[minmax(0,2fr)_140px_140px_180px_180px_180px] border-b border-border bg-white/3 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>Username</span>
          <span>Role</span>
          <span>Status</span>
          <span>Created</span>
          <span>Updated</span>
          <span />
        </div>
        {users.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">사용자가 없습니다.</div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[minmax(0,2fr)_140px_140px_180px_180px_180px] items-center border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="truncate text-[14px]">{user.username}</span>
              <Badge variant={user.role === "admin" ? "blue" : "neutral"}>{user.role}</Badge>
              <Badge variant="green">active</Badge>
              <span className="truncate text-[13px] text-muted-foreground">{formatDate(user.created_at)}</span>
              <span className="truncate text-[13px] text-muted-foreground">{formatDate(user.updated_at)}</span>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleRole(user.id, user.role)}
                  title={user.role === "admin" ? "일반 사용자로 변경" : "관리자로 변경"}
                >
                  {user.role === "admin" ? "Demote" : "Promote"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(user.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <UserPlus className="mr-1 size-4" />
          사용자 추가
        </Button>
      ) : (
        <Card className="p-4">
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "user")}
                className={selectClassName}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? "..." : "생성"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                취소
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </Card>
      )}
    </div>
  );
}
