"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import type { Workspace } from "@/lib/db/workspaces";

interface WorkspaceManagerProps {
  workspaces: Workspace[];
}

export function WorkspaceManager({ workspaces }: WorkspaceManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/w", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, description }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed");
        return;
      }
      setShowForm(false);
      setSlug("");
      setName("");
      setDescription("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("워크스페이스를 삭제하시겠습니까? 번들 데이터도 함께 삭제됩니다.")) return;
    await fetch(`/api/w`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{ws.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{ws.slug}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(ws.id)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4 mr-1" />
          워크스페이스 추가
        </Button>
      ) : (
        <form onSubmit={handleCreate} className="space-y-3 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Slug (e.g. my-team)"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            />
            <input
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <input
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
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
