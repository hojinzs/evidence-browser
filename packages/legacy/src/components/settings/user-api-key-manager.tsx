"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KeyRound, Plus, Trash2, Copy, Check } from "lucide-react";

type ApiKeyScope = "read" | "upload";

interface ApiKeyPublic {
  id: string;
  name: string;
  key_prefix: string;
  user_id: string;
  scope: "read" | "upload" | "admin";
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface UserApiKeyManagerProps {
  initialKeys: ApiKeyPublic[];
}

function ScopeBadge({ scope }: { scope: ApiKeyPublic["scope"] }) {
  if (scope === "admin") {
    return (
      <Badge className="border border-red-400/30 bg-red-400/10 text-red-400">
        admin
      </Badge>
    );
  }
  if (scope === "upload") {
    return (
      <Badge className="border border-blue-400/30 bg-blue-400/10 text-blue-400">
        upload
      </Badge>
    );
  }
  return (
    <Badge className="border border-border text-muted-foreground">
      read
    </Badge>
  );
}

function formatDate(val: string | null): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function UserApiKeyManager({ initialKeys }: UserApiKeyManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("read");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, string> = { name, scope };
      if (expiresAt) body.expiresAt = expiresAt;
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to create key");
        return;
      }
      const data = (await res.json()) as { key: string };
      setNewKey(data.key);
      setName("");
      setScope("read");
      setExpiresAt("");
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 API 키를 삭제하시겠습니까?")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function handleCopy(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {/* Revealed key banner */}
      {newKey && (
        <Card className="border-primary/30 bg-primary/5 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[13px] font-medium text-foreground">
                API 키가 생성되었습니다
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[13px] text-foreground">
                  {newKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(newKey)}
                >
                  {copied ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "복사됨" : "복사"}
                </Button>
              </div>
              <p className="text-[12px] text-destructive">
                이 창을 닫으면 다시 볼 수 없습니다. 지금 바로 저장하세요.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewKey(null)}
            >
              닫기
            </Button>
          </div>
        </Card>
      )}

      {/* Keys table */}
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-[minmax(0,2fr)_150px_80px_130px_130px_140px_56px] border-b border-border bg-white/3 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span>Name</span>
          <span>Prefix</span>
          <span>Scope</span>
          <span>Expires</span>
          <span>Last Used</span>
          <span>Created</span>
          <span />
        </div>
        {initialKeys.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            아직 API 키가 없습니다. 아래에서 새 키를 생성하세요.
          </div>
        ) : (
          initialKeys.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-[minmax(0,2fr)_150px_80px_130px_130px_140px_56px] items-center border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="truncate text-[13px]">{k.name}</span>
              <code className="truncate font-mono text-[12px] text-muted-foreground">
                {k.key_prefix}
              </code>
              <ScopeBadge scope={k.scope} />
              <span className="truncate text-[13px] text-muted-foreground">
                {formatDate(k.expires_at)}
              </span>
              <span className="truncate text-[13px] text-muted-foreground">
                {formatDate(k.last_used_at)}
              </span>
              <span className="truncate text-[13px] text-muted-foreground">
                {formatDate(k.created_at)}
              </span>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(k.id)}
                  aria-label="키 삭제"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Create form */}
      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1 size-4" />
          API 키 생성
        </Button>
      ) : (
        <Card className="p-4">
          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              placeholder="키 이름 (예: MCP CLI)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as ApiKeyScope)}
                className="h-9 rounded-lg border border-input bg-black/30 px-3 text-[13px] text-foreground outline-none transition-colors duration-150 focus:border-primary focus:ring-3 focus:ring-ring"
              >
                <option value="read">read</option>
                <option value="upload">upload</option>
              </select>
              <Input
                type="date"
                placeholder="만료일 (선택)"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? "..." : "생성"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
              >
                취소
              </Button>
            </div>
            {error && (
              <p className="text-[13px] text-destructive">{error}</p>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}
