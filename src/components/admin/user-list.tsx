"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserPlus, Trash2, Shield, User } from "lucide-react";
import type { UserPublic } from "@/lib/db/users";

interface UserListProps {
  users: UserPublic[];
}

export function UserList({ users }: UserListProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed");
        return;
      }
      setShowForm(false);
      setUsername("");
      setPassword("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("사용자를 삭제하시겠습니까?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function handleToggleRole(id: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2"
          >
            <div className="flex items-center gap-2">
              {u.role === "admin" ? (
                <Shield className="size-4 text-primary" />
              ) : (
                <User className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{u.username}</span>
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                {u.role}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleRole(u.id, u.role)}
                title={u.role === "admin" ? "일반 사용자로 변경" : "관리자로 변경"}
              >
                {u.role === "admin" ? "Demote" : "Promote"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(u.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <UserPlus className="size-4 mr-1" />
          사용자 추가
        </Button>
      ) : (
        <form onSubmit={handleCreateUser} className="space-y-3 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
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
      )}
    </div>
  );
}
