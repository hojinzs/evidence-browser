import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { WorkspaceWithBundleCount } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface WorkspaceManagerProps {
  workspaces: WorkspaceWithBundleCount[];
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export function WorkspaceManager({ workspaces }: WorkspaceManagerProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  async function refreshWorkspaces() {
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.createWorkspace({ slug, name, description });
      setShowForm(false);
      setSlug("");
      setName("");
      setDescription("");
      await refreshWorkspaces();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("워크스페이스를 삭제하시겠습니까? 번들 데이터도 함께 삭제됩니다.")) return;
    try {
      await api.deleteWorkspace(id);
      await refreshWorkspaces();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
    }
  }

  function handleStartEdit(workspace: WorkspaceWithBundleCount) {
    setShowForm(false);
    setEditingId(workspace.id);
    setEditName(workspace.name);
    setEditDescription(workspace.description);
    setEditError("");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setEditError("");
    setEditLoading(false);
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setEditError("");
    setEditLoading(true);

    try {
      await api.updateWorkspace(id, { name: editName, description: editDescription });
      handleCancelEdit();
      await refreshWorkspaces();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[minmax(0,2fr)_180px_180px_180px_180px_120px_80px] border-b border-border bg-white/3 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>Name</span>
          <span>Slug</span>
          <span>Bundles</span>
          <span>Created</span>
          <span>Updated</span>
          <span>Owner</span>
          <span />
        </div>
        {workspaces.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">워크스페이스가 없습니다.</div>
        ) : (
          workspaces.map((workspace) => (
            <div key={workspace.id} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[minmax(0,2fr)_180px_180px_180px_180px_120px_80px] items-center px-4 py-3">
                <span className="truncate text-[14px]">{workspace.name}</span>
                <span className="truncate font-mono text-[13px] text-muted-foreground">{workspace.slug}</span>
                <span className="truncate text-[13px] text-muted-foreground">{workspace.bundle_count}</span>
                <span className="truncate text-[13px] text-muted-foreground">{formatDate(workspace.created_at)}</span>
                <span className="truncate text-[13px] text-muted-foreground">{formatDate(workspace.updated_at)}</span>
                <span className="truncate text-[13px] text-muted-foreground">{workspace.created_by}</span>
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleStartEdit(workspace)} aria-label={`Edit ${workspace.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(workspace.id)}
                    aria-label={`Delete ${workspace.name}`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {editingId === workspace.id && (
                <form
                  onSubmit={(e) => void handleUpdate(e, workspace.id)}
                  className="border-t border-border bg-white/2 px-4 py-4"
                  aria-label={`${workspace.name} workspace settings`}
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="이름"
                      required
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="설명"
                      className="min-h-[92px] w-full rounded-lg border border-input bg-black/30 px-3 py-2 text-[13px] text-foreground placeholder:text-[oklch(0.55_0_0)] transition-colors duration-150 outline-none focus:border-primary focus:ring-3 focus:ring-ring"
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={editLoading}>
                      <Check className="mr-1 size-4" />
                      {editLoading ? "저장 중" : "저장"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
                      <X className="mr-1 size-4" />
                      취소
                    </Button>
                  </div>
                  {editError && <p className="mt-3 text-sm text-destructive">{editError}</p>}
                </form>
              )}
            </div>
          ))
        )}
      </Card>

      {!showForm ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            handleCancelEdit();
            setShowForm(true);
          }}
        >
          <Plus className="mr-1 size-4" />
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
