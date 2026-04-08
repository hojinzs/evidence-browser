"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, Loader2, Shield, HardDrive, FolderOpen } from "lucide-react";

type Step = "admin" | "storage" | "workspace" | "done";

interface SetupWizardProps {
  storageType: string;
  storagePath: string;
  skipAdmin?: boolean;
}

export function SetupWizard({ storageType, storagePath, skipAdmin }: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(skipAdmin ? "storage" : "admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // Step 3 state
  const [wsSlug, setWsSlug] = useState("default");
  const [wsName, setWsName] = useState("Default");
  const [wsDesc, setWsDesc] = useState("");

  // Storage verification result
  const [storageResult, setStorageResult] = useState<{
    ok: boolean;
    storageType?: string;
    bundleCount?: number;
    error?: string;
  } | null>(null);

  async function handleCreateAdmin() {
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create admin");
        return;
      }
      setStep("storage");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyStorage() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/verify-storage", {
        method: "POST",
      });
      const data = await res.json();
      setStorageResult(data);
      if (data.ok) {
        // Auto-advance after short delay
        setTimeout(() => setStep("workspace"), 800);
      }
    } catch {
      setStorageResult({ ok: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateWorkspace() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: wsSlug, name: wsName, description: wsDesc }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create workspace");
        return;
      }
      setStep("done");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1500);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const steps: { key: Step; label: string }[] = [
    { key: "admin", label: "관리자 계정" },
    { key: "storage", label: "스토리지" },
    { key: "workspace", label: "워크스페이스" },
  ];

  const stepOrder: Step[] = ["admin", "storage", "workspace", "done"];
  const currentIndex = stepOrder.indexOf(step);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Evidence Browser Setup</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          초기 설정을 완료해주세요
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => {
          const done = currentIndex > i || step === "done";
          const active = s.key === step;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "border-2 border-primary text-primary"
                      : "border border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        {step === "admin" && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="size-4" />
              관리자 계정 생성
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="setup-username" className="text-sm">Username</label>
                <input
                  id="setup-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="setup-password" className="text-sm">Password</label>
                <input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="setup-password-confirm" className="text-sm">Password 확인</label>
                <input
                  id="setup-password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleCreateAdmin} disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              다음
            </Button>
          </>
        )}

        {step === "storage" && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <HardDrive className="size-4" />
              스토리지 연결 확인
            </div>
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Type:</span> {storageType}</p>
              {storagePath && (
                <p><span className="text-muted-foreground">Path:</span> {storagePath}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                환경변수로 설정된 스토리지 정보입니다. 변경하려면 환경변수를 수정 후 재시작하세요.
              </p>
            </div>
            {storageResult && (
              <div className={`rounded-md p-3 text-sm ${storageResult.ok ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}>
                {storageResult.ok
                  ? `연결 성공 (번들 ${storageResult.bundleCount}개 발견)`
                  : `연결 실패: ${storageResult.error}`}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleVerifyStorage} disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              연결 확인
            </Button>
          </>
        )}

        {step === "workspace" && (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderOpen className="size-4" />
              첫 워크스페이스 생성
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="ws-slug" className="text-sm">Slug (URL 경로)</label>
                <input
                  id="ws-slug"
                  value={wsSlug}
                  onChange={(e) => setWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="my-workspace"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ws-name" className="text-sm">이름</label>
                <input
                  id="ws-name"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="My Workspace"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ws-desc" className="text-sm">설명 (선택)</label>
                <input
                  id="ws-desc"
                  value={wsDesc}
                  onChange={(e) => setWsDesc(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleCreateWorkspace} disabled={loading} className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              완료
            </Button>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-4 space-y-2">
            <Check className="size-12 text-primary mx-auto" />
            <p className="font-medium">설정 완료!</p>
            <p className="text-sm text-muted-foreground">대시보드로 이동합니다...</p>
          </div>
        )}
      </div>
    </div>
  );
}
