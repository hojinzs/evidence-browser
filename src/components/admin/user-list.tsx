"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserPlus, Trash2 } from "lucide-react";
import type { UserPublic } from "@/lib/db/users";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

  async function handleCreateUser(e: { preventDefault(): void }) {
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
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[minmax(0,2fr)_140px_140px_180px_180px_180px] border-b border-border bg-white/3 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>Username</span>
          <span>Role</span>
          <span>Status</span>
          <span>Created</span>
          <span>Updated</span>
          <span />
        </div>
        {users.map((u) => (
          <div
            key={u.id}
            className="grid grid-cols-[minmax(0,2fr)_140px_140px_180px_180px_180px] items-center border-b border-border px-4 py-3 last:border-b-0"
          >
            <span className="truncate text-[14px]">{u.username}</span>
            <Badge variant={u.role === "admin" ? "blue" : "neutral"}>{u.role}</Badge>
            <Badge variant="green">active</Badge>
            <span className="truncate text-[13px] text-muted-foreground">{u.created_at}</span>
            <span className="truncate text-[13px] text-muted-foreground">{u.updated_at}</span>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleRole(u.id, u.role)}
                title={u.role === "admin" ? "일반 사용자로 변경" : "관리자로 변경"}
              >
                {u.role === "admin" ? "Demote" : "Promote"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(u.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <UserPlus className="size-4 mr-1" />
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
              className="h-9 rounded-lg border border-input bg-black/30 px-3 text-[13px] text-foreground outline-none transition-colors duration-150 focus:border-primary focus:ring-3 focus:ring-ring"
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
