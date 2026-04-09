"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { Workspace } from "@/lib/db/workspaces";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[minmax(0,2fr)_180px_180px_180px_180px_120px] border-b border-border bg-white/3 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>Name</span>
          <span>Slug</span>
          <span>Created</span>
          <span>Updated</span>
          <span>Owner</span>
          <span />
        </div>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="grid grid-cols-[minmax(0,2fr)_180px_180px_180px_180px_120px] items-center border-b border-border px-4 py-3 last:border-b-0"
          >
            <span className="truncate text-[14px]">{ws.name}</span>
            <span className="truncate font-mono text-[13px] text-muted-foreground">{ws.slug}</span>
            <span className="truncate text-[13px] text-muted-foreground">{ws.created_at}</span>
            <span className="truncate text-[13px] text-muted-foreground">{ws.updated_at}</span>
            <span className="truncate text-[13px] text-muted-foreground">{ws.created_by}</span>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => handleDelete(ws.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4 mr-1" />
          워크스페이스 추가
        </Button>
      ) : (
        <Card className="p-4">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Slug (e.g. my-team)"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
              className="font-mono"
            />
            <Input
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Input
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
        </Card>
      )}
    </div>
  );
}
