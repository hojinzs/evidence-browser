"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadFormProps {
  workspaceSlug: string;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function UploadForm({ workspaceSlug }: UploadFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const upload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        setError("ZIP 파일만 업로드 가능합니다");
        setState("error");
        return;
      }

      setState("uploading");
      setError("");
      setProgress(0);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ ok: true });
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve({ ok: false, error: data.error });
              } catch {
                resolve({ ok: false, error: `Upload failed (${xhr.status})` });
              }
            }
          });
          xhr.addEventListener("error", () => resolve({ ok: false, error: "Network error" }));
          xhr.open("POST", `/api/w/${workspaceSlug}/bundle`);
          xhr.send(formData);
        });

        if (result.ok) {
          setState("success");
          setTimeout(() => {
            setState("idle");
            router.refresh();
          }, 1500);
        } else {
          setError(result.error || "Upload failed");
          setState("error");
        }
      } catch {
        setError("Network error");
        setState("error");
      }
    },
    [workspaceSlug, router]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // Reset input so same file can be selected again
    e.target.value = "";
  }

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
        dragOver
          ? "border-primary bg-primary/5"
          : state === "error"
            ? "border-destructive/50"
            : "border-border hover:border-muted-foreground/50"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleFileSelect}
      />

      {state === "idle" && (
        <div className="space-y-2">
          <Upload className="size-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            ZIP 파일을 드래그하거나{" "}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              파일 선택
            </button>
          </p>
        </div>
      )}

      {state === "uploading" && (
        <div className="space-y-2">
          <Loader2 className="size-8 text-primary mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground">업로드 중... {progress}%</p>
          <div className="mx-auto w-48 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {state === "success" && (
        <div className="space-y-2">
          <CheckCircle className="size-8 text-green-500 mx-auto" />
          <p className="text-sm text-green-600">업로드 완료!</p>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-2">
          <XCircle className="size-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setState("idle")}
          >
            다시 시도
          </Button>
        </div>
      )}
    </div>
  );
}
