import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";

interface UploadFormProps {
  workspaceSlug: string;
  onUploaded?: () => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function UploadForm({ workspaceSlug, onUploaded }: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const upload = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      setError("Only ZIP files can be uploaded");
      setState("error");
      return;
    }

    setState("uploading");
    setError("");
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.uploadBundleWithProgress(workspaceSlug, formData, setProgress);
      setState("success");
      setTimeout(() => {
        setState("idle");
        onUploaded?.();
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
      setState("error");
    }
  }, [onUploaded, workspaceSlug]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    e.target.value = "";
  }

  return (
    <Card className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragOver ? "border-primary bg-primary/8" : state === "error" ? "border-destructive/50 bg-destructive/5" : "surface-card-hover border-border bg-card"}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
      <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleFileSelect} />
      {state === "idle" && <div className="space-y-3"><Upload className="mx-auto size-8 text-muted-foreground" /><p className="text-[14px] text-foreground">Drop a ZIP bundle here</p><p className="text-sm text-muted-foreground"><button type="button" onClick={() => fileInputRef.current?.click()} className="font-medium text-primary transition-colors duration-150 hover:text-primary/80">Select file</button>{" "}or drag and drop</p><p className="text-xs text-[oklch(0.55_0_0)]">.zip only</p></div>}
      {state === "uploading" && <div className="space-y-2"><Loader2 className="size-8 text-primary mx-auto animate-spin" /><p className="text-sm text-muted-foreground">Uploading... {progress}%</p><div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} /></div></div>}
      {state === "success" && <div className="space-y-2"><CheckCircle className="mx-auto size-8 text-success" /><p className="text-sm text-success">Upload complete.</p></div>}
      {state === "error" && <div className="space-y-2"><XCircle className="mx-auto size-8 text-destructive" /><p className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => setState("idle")}>Try again</Button></div>}
    </Card>
  );
}
