import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

class FakeUploadTarget {
  private progressListener?: (event: ProgressEvent) => void;

  addEventListener(type: "progress", listener: (event: ProgressEvent) => void) {
    if (type === "progress") this.progressListener = listener;
  }

  emitProgress(loaded: number, total: number) {
    this.progressListener?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
}

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  readonly upload = new FakeUploadTarget();
  method = "";
  url = "";
  body?: FormData;
  responseText = "";
  status = 0;
  withCredentials = false;

  private listeners = new Map<string, () => void>();

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }

  respond(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.listeners.get("load")?.();
  }

  fail() {
    this.listeners.get("error")?.();
  }
}

describe("api.uploadBundleWithProgress", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
  });

  it("uploads bundles through the shared endpoint with credentials and progress", async () => {
    const formData = new FormData();
    const progress = vi.fn();

    const upload = api.uploadBundleWithProgress("infra", formData, progress);
    const xhr = FakeXMLHttpRequest.instances[0];

    xhr.upload.emitProgress(25, 100);
    xhr.respond(201, JSON.stringify({ bundle: { id: "bundle-1" } }));

    await expect(upload).resolves.toEqual({ bundle: { id: "bundle-1" } });
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/w/infra/bundle");
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.body).toBe(formData);
    expect(progress).toHaveBeenCalledWith(25);
  });

  it("rejects with ApiError using server-provided upload errors", async () => {
    const upload = api.uploadBundleWithProgress("infra", new FormData());
    const xhr = FakeXMLHttpRequest.instances[0];

    xhr.respond(400, JSON.stringify({ error: "Invalid bundle" }));

    await expect(upload).rejects.toMatchObject(new ApiError(400, "Invalid bundle"));
  });

  it("rejects network failures as ApiError", async () => {
    const upload = api.uploadBundleWithProgress("infra", new FormData());
    const xhr = FakeXMLHttpRequest.instances[0];

    xhr.fail();

    await expect(upload).rejects.toMatchObject(new ApiError(0, "Network error"));
  });
});
