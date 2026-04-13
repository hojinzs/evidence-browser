import React from "react";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { AppShell, MobileSidebarTrigger } from "@/components/layout/app-shell";
import { Header } from "@/components/layout/header";
import { BrandMark } from "@/components/layout/brand";
import { WorkspaceCard } from "@/components/workspace/workspace-card";
import { BundleCard } from "@/components/bundle/bundle-card";
import { UploadForm } from "@/components/bundle/upload-form";
import { FileTree, TreeProvider } from "@/components/file-tree";
import { FileViewer, MarkdownViewer } from "@/components/viewers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarNavItem } from "@/components/ui/sidebar-nav-item";
import { UserList } from "@/components/admin/user-list";
import { WorkspaceManager } from "@/components/admin/workspace-manager";
import { ApiKeyManager } from "@/components/admin/api-key-manager";
import { UserApiKeyManager } from "@/components/settings/user-api-key-manager";
import { api, ApiError } from "@/lib/api";
import { useAuth, AuthProvider } from "@/lib/auth";
import { bundleFileUrl, bundleLandingUrl } from "@/lib/url";
import { detectFileType } from "@/lib/files/detect";
import type { TreeNode } from "@/lib/bundle/types";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && location.pathname !== "/login") {
      const callbackUrl = location.pathname + location.searchStr + location.hash;
      void navigate({ to: "/login", search: { callbackUrl } });
    }
  }, [auth.isAuthenticated, auth.isLoading, location.hash, location.pathname, location.searchStr, navigate]);

  if (auth.isLoading) return <div className="min-h-screen bg-background" />;
  if (!auth.isAuthenticated) return null;
  return <>{children}</>;
}

function getFirstLevelDirs(tree: TreeNode[]): string[] {
  return tree.filter((node) => node.type === "directory").map((node) => node.path);
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) return <div className="min-h-screen bg-background" />;
  if (!auth.isAuthenticated) return null;
  if (auth.user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header title="Admin" userName={auth.user?.username} nav={<Link to="/" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">← Workspaces</Link>} />
        <main className="page-frame py-12">
          <Card className="p-10 text-center text-muted-foreground">관리자 권한이 필요합니다.</Card>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}

function CheckSetup({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const setupQuery = useQuery({
    queryKey: ["setup", "status"],
    queryFn: () => api.setupStatus(),
    retry: false,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!setupQuery.isLoading && setupQuery.data?.needsSetup && !location.pathname.startsWith("/setup")) {
      void navigate({ to: "/setup" });
    }
  }, [setupQuery.isLoading, setupQuery.data?.needsSetup, location.pathname, navigate]);

  return <>{children}</>;
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CheckSetup>
          <Outlet />
        </CheckSetup>
        <TanStackRouterDevtools position="bottom-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const search = loginRoute.useSearch();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      void navigate({ to: search.callbackUrl || "/" });
    }
  }, [auth.isAuthenticated, auth.isLoading, navigate, search.callbackUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.login(username, password);
      await auth.refresh();
      await navigate({ to: search.callbackUrl || "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-fade-up relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_12%,transparent)_0%,transparent_28%)]" />
      <Card className="relative z-10 w-full max-w-sm p-6">
        <div className="pb-5">
          <BrandMark />
          <div className="pt-8">
            <h1 className="text-xl font-semibold">Sign in to your workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your credentials to access your workspace.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <input id="username" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "로그인 중..." : "Sign in"}</Button>
        </form>
      </Card>
    </div>
  );
}

function WorkspacesPage() {
  const auth = useAuth();
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.getWorkspaces, enabled: auth.isAuthenticated });
  const isAdmin = auth.user?.role === "admin";

  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <Header
          title="Workspaces"
          userName={auth.user?.username}
          nav={
            <>
              <span className="rounded-md bg-white/7 px-3 py-2 text-[20px] font-medium text-foreground sm:text-[13px]">Workspaces</span>
              <span className="px-3 py-2 text-[13px] text-muted-foreground">Bundles</span>
              {isAdmin && <Link to="/admin" className="px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground">Admin</Link>}
            </>
          }
        />
        <main className="app-fade-up page-frame py-12">
          <div className="mb-7 flex items-end gap-6">
            <div>
              <h2 className="text-[20px] font-semibold">Workspaces</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Browse and manage your evidence workspaces.</p>
            </div>
            <div className="h-px flex-1 bg-border" />
          </div>
          {workspacesQuery.isLoading ? (
            <Card className="p-10 text-center text-muted-foreground">Loading workspaces...</Card>
          ) : workspacesQuery.data?.workspaces.length ? (
            <Card className="overflow-hidden p-0">
              {workspacesQuery.data.workspaces.map((ws) => (
                <WorkspaceCard key={ws.id} slug={ws.slug} name={ws.name} description={ws.description} bundleCount={ws.bundle_count} />
              ))}
            </Card>
          ) : (
            <Card className="p-10 text-center text-muted-foreground">워크스페이스가 없습니다</Card>
          )}
        </main>
      </div>
    </RequireAuth>
  );
}

function WorkspacePage() {
  const auth = useAuth();
  const { ws } = workspaceRoute.useParams();
  const navigate = useNavigate();
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.getWorkspaces, enabled: auth.isAuthenticated });
  const bundlesQuery = useQuery({ queryKey: ["bundles", ws], queryFn: () => api.getBundles(ws), enabled: auth.isAuthenticated });
  const workspace = workspacesQuery.data?.workspaces.find((item) => item.slug === ws);

  React.useEffect(() => {
    if (!workspacesQuery.isLoading && !workspace) {
      void navigate({ to: "/" });
    }
  }, [navigate, workspace, workspacesQuery.isLoading]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <Header title={workspace?.name ?? ws} userName={auth.user?.username} nav={<Link to="/" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">← Workspaces</Link>} />
        <main className="app-fade-up page-frame py-12">
          <div className="mb-6 flex items-end gap-6">
            <div>
              <h2 className="text-[20px] font-semibold">{workspace?.name ?? ws}</h2>
              {workspace?.description && <p className="mt-1 text-[13px] text-muted-foreground">{workspace.description}</p>}
            </div>
            <div className="h-px flex-1 bg-border" />
            <Badge variant="neutral">{bundlesQuery.data?.bundles.length ?? 0} bundles</Badge>
          </div>
          <div className="space-y-8">
            {auth.user?.role === "admin" && <UploadForm workspaceSlug={ws} onUploaded={() => void queryClient.invalidateQueries({ queryKey: ["bundles", ws] })} />}
            <section>
              <h3 className="mb-3 text-lg font-semibold">Recent Bundles</h3>
              {bundlesQuery.isLoading ? (
                <Card className="p-10 text-center text-muted-foreground">Loading bundles...</Card>
              ) : bundlesQuery.data?.bundles.length ? (
                <Card className="overflow-hidden p-0">
                  {bundlesQuery.data.bundles.map((bundle) => (
                    <BundleCard key={bundle.id} title={bundle.title || bundle.bundle_id} bundleId={bundle.bundle_id} href={bundleLandingUrl(ws, bundle.bundle_id)} uploadedBy={bundle.uploader_username} createdAt={bundle.created_at} sizeBytes={bundle.size_bytes} />
                  ))}
                </Card>
              ) : (
                <Card className="p-10 text-center text-muted-foreground">아직 번들이 없습니다</Card>
              )}
            </section>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}

function BundleRoutePage() {
  const { ws, bundleId } = bundleRoute.useParams();
  return <BundleView ws={ws} bundleId={bundleId} mode="landing" />;
}

function BundleFileRoutePage() {
  const { ws, bundleId } = bundleFileRoute.useParams();
  const search = bundleFileRoute.useSearch();
  return <BundleView ws={ws} bundleId={bundleId} mode="file" currentFilePath={search.path} />;
}

function BundleView({
  ws,
  bundleId,
  mode,
  currentFilePath = null,
}: {
  ws: string;
  bundleId: string;
  mode: "landing" | "file";
  currentFilePath?: string | null;
}) {
  const auth = useAuth();
  const metaQuery = useQuery({ queryKey: ["bundle-meta", ws, bundleId], queryFn: () => api.getBundleMeta(ws, bundleId), enabled: auth.isAuthenticated });
  const activeFilePath = currentFilePath || metaQuery.data?.manifest.index || null;
  const activeFileType = activeFilePath ? detectFileType(activeFilePath) : null;
  const requiresTextContent = mode === "landing" || activeFileType === "markdown" || activeFileType === "code" || activeFileType === "text";
  const fileQuery = useQuery({
    queryKey: ["bundle-file", ws, bundleId, activeFilePath],
    queryFn: () => api.getBundleFileText(ws, bundleId, activeFilePath!),
    enabled: auth.isAuthenticated && Boolean(activeFilePath) && requiresTextContent,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
  });

  const sidebar = metaQuery.data ? (
    <TreeProvider bundleId={bundleId} workspaceSlug={ws} currentFilePath={currentFilePath} initialExpandedPaths={getFirstLevelDirs(metaQuery.data.tree)}>
      <FileTree tree={metaQuery.data.tree} bundleId={metaQuery.data.manifest.title} />
    </TreeProvider>
  ) : null;

  let content: React.ReactNode = <Card className="p-10 text-center text-muted-foreground">Loading bundle...</Card>;
  if (metaQuery.data && activeFilePath && (!requiresTextContent || fileQuery.data)) {
    const fileType = activeFileType;
    if (mode === "landing") {
      content = <MarkdownViewer content={fileQuery.data ?? ""} workspaceSlug={ws} bundleId={bundleId} currentFilePath={metaQuery.data.manifest.index} />;
    } else if (fileType === "markdown" || fileType === "code" || fileType === "text") {
      content = <FileViewer workspaceSlug={ws} bundleId={bundleId} filePath={activeFilePath} content={fileQuery.data} />;
    } else {
      content = <FileViewer workspaceSlug={ws} bundleId={bundleId} filePath={activeFilePath} />;
    }
  }

  return (
    <RequireAuth>
      <div className="flex h-screen flex-col">
        <Header
          title={ws}
          filePath={currentFilePath}
          userName={auth.user?.username}
          mobileTrigger={sidebar ? <MobileSidebarTrigger sidebar={sidebar} /> : undefined}
          nav={<span className="text-[13px] text-muted-foreground">{bundleId}</span>}
        />
        {sidebar ? (
          <AppShell sidebar={sidebar} filePath={currentFilePath}>
            <div className="app-fade-up page-frame max-w-none px-4 py-8 lg:px-8">{content}</div>
          </AppShell>
        ) : (
          <div className="app-fade-up page-frame max-w-none px-4 py-8 lg:px-8">{content}</div>
        )}
      </div>
    </RequireAuth>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  const auth = useAuth();
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <Header title={title} userName={auth.user?.username} nav={<Link to="/" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">← Workspaces</Link>} />
        <main className="page-frame py-12">
          <Card className="p-10 text-center text-muted-foreground">{title} 화면은 아직 Vite 앱으로 완전히 이식되지 않았습니다.</Card>
        </main>
      </div>
    </RequireAuth>
  );
}

function AdminPage() {
  const auth = useAuth();
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.getUsers(),
    enabled: auth.isAuthenticated && auth.user?.role === "admin",
  });
  const workspacesQuery = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => api.getWorkspaces(),
    enabled: auth.isAuthenticated && auth.user?.role === "admin",
  });
  const keysQuery = useQuery({
    queryKey: ["admin", "api-keys"],
    queryFn: () => api.getAdminApiKeys(),
    enabled: auth.isAuthenticated && auth.user?.role === "admin",
  });

  const isLoading = usersQuery.isLoading || workspacesQuery.isLoading || keysQuery.isLoading;
  const error = usersQuery.error ?? workspacesQuery.error ?? keysQuery.error;

  return (
    <RequireAuth>
      <RequireAdmin>
        <div className="min-h-screen bg-background">
          <Header title="Admin" userName={auth.user?.username} nav={<Link to="/" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">← Workspaces</Link>} />
          <div className="flex min-h-[calc(100vh-3rem)]">
            <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar lg:block">
              <div className="px-4 py-6">
                <p className="eyebrow-label mb-3">Administration</p>
                <nav className="space-y-1">
                  <SidebarNavItem label="Users" active />
                  <SidebarNavItem label="Settings" href="/settings" />
                </nav>
              </div>
            </aside>
            <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">
              {isLoading ? (
                <Card className="p-10 text-center text-muted-foreground">Loading admin data...</Card>
              ) : error ? (
                <Card className="p-10 text-center text-destructive">{error instanceof Error ? error.message : "Failed to load admin data"}</Card>
              ) : (
                <div className="app-fade-up space-y-10">
                  <section className="space-y-4">
                    <div className="flex items-end gap-6">
                      <div>
                        <h2 className="text-xl font-semibold">User Management</h2>
                        <p className="mt-1 text-[13px] text-muted-foreground">Manage access and permissions for workspace users.</p>
                      </div>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <UserList users={usersQuery.data?.users ?? []} />
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-end gap-6">
                      <div>
                        <h2 className="text-xl font-semibold">Workspace Management</h2>
                        <p className="mt-1 text-[13px] text-muted-foreground">Create and configure evidence workspaces.</p>
                      </div>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <WorkspaceManager workspaces={workspacesQuery.data?.workspaces ?? []} />
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-end gap-6">
                      <div>
                        <h2 className="text-xl font-semibold">API Keys</h2>
                        <p className="mt-1 text-[13px] text-muted-foreground">Manage API keys for MCP and CLI access.</p>
                      </div>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <ApiKeyManager initialKeys={keysQuery.data?.keys ?? []} users={usersQuery.data?.users ?? []} />
                  </section>
                </div>
              )}
            </main>
          </div>
        </div>
      </RequireAdmin>
    </RequireAuth>
  );
}

function SettingsPage() {
  const auth = useAuth();
  const keysQuery = useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: () => api.getMyApiKeys(),
    enabled: auth.isAuthenticated,
  });

  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <Header
          title="Settings"
          userName={auth.user?.username}
          nav={
            <div className="flex items-center gap-1">
              {auth.user?.role === "admin" && <Link to="/admin" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">Admin</Link>}
              <Link to="/" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">Workspaces</Link>
            </div>
          }
        />
        <main className="mx-auto max-w-3xl px-6 py-8">
          {keysQuery.isLoading ? (
            <Card className="p-10 text-center text-muted-foreground">Loading settings...</Card>
          ) : keysQuery.error ? (
            <Card className="p-10 text-center text-destructive">{keysQuery.error instanceof Error ? keysQuery.error.message : "Failed to load settings"}</Card>
          ) : (
            <div className="app-fade-up space-y-10">
              <section className="space-y-4">
                <div className="flex items-end gap-6">
                  <div>
                    <h2 className="text-xl font-semibold">API Keys</h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">Create and manage your personal API keys.</p>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <UserApiKeyManager initialKeys={keysQuery.data?.keys ?? []} />
              </section>
            </div>
          )}
        </main>
      </div>
    </RequireAuth>
  );
}

type SetupStep = "admin" | "storage" | "workspace" | "done";

function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setupQuery = useQuery({
    queryKey: ["setup", "status"],
    queryFn: () => api.setupStatus(),
    retry: false,
  });

  const skipAdmin = setupQuery.data?.hasAdmin ?? false;
  const [step, setStep] = React.useState<SetupStep | null>(null);

  // Determine initial step once status is known
  React.useEffect(() => {
    if (setupQuery.isLoading || step !== null) return;
    if (setupQuery.data && !setupQuery.data.needsSetup) {
      void navigate({ to: "/" });
    } else {
      setStep(setupQuery.data?.hasAdmin ? "storage" : "admin");
    }
  }, [setupQuery.isLoading, setupQuery.data, step, navigate]);

  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [wsSlug, setWsSlug] = React.useState("default");
  const [wsName, setWsName] = React.useState("Default");
  const [wsDesc, setWsDesc] = React.useState("");
  const [storageResult, setStorageResult] = React.useState<{ ok: boolean; storageType?: string; bundleCount?: number; error?: string } | null>(null);

  async function handleCreateAdmin() {
    if (password !== passwordConfirm) { setError("비밀번호가 일치하지 않습니다"); return; }
    if (password.length < 4) { setError("비밀번호는 4자 이상이어야 합니다"); return; }
    setError(""); setLoading(true);
    try {
      await api.setupAdmin(username, password);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setStep("storage");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create admin");
    } finally { setLoading(false); }
  }

  async function handleVerifyStorage() {
    setError(""); setLoading(true);
    try {
      const data = await api.setupVerifyStorage();
      setStorageResult(data);
      if (data.ok) setTimeout(() => setStep("workspace"), 800);
    } catch (err) {
      setStorageResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally { setLoading(false); }
  }

  async function handleCreateWorkspace() {
    setError(""); setLoading(true);
    try {
      await api.setupWorkspace(wsSlug, wsName, wsDesc || undefined);
      setStep("done");
      await queryClient.invalidateQueries({ queryKey: ["setup", "status"] });
      setTimeout(() => { void navigate({ to: "/" }); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally { setLoading(false); }
  }

  const steps: { key: SetupStep; label: string }[] = [
    { key: "admin", label: "관리자 계정" },
    { key: "storage", label: "스토리지" },
    { key: "workspace", label: "워크스페이스" },
  ];
  const stepOrder: SetupStep[] = ["admin", "storage", "workspace", "done"];
  const currentIndex = step ? stepOrder.indexOf(step) : 0;

  if (setupQuery.isLoading || step === null) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-lg p-6">
        <div className="space-y-8">
          <div className="text-center">
            <BrandMark />
            <h1 className="mt-6 text-2xl font-bold">Evidence Browser Setup</h1>
            <p className="mt-2 text-sm text-muted-foreground">초기 설정을 완료해주세요</p>
          </div>

          <div className="flex items-center justify-center gap-2">
            {steps.map((s, i) => {
              const done = currentIndex > i || step === "done";
              const active = s.key === step;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${done ? "bg-primary text-primary-foreground" : active ? "border-2 border-primary text-primary" : "border border-muted-foreground/30 text-muted-foreground"}`}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span className={`hidden text-xs sm:inline ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                  {i < steps.length - 1 && <span className="text-muted-foreground">›</span>}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border p-6 space-y-4">
            {step === "admin" && (
              <>
                <p className="text-sm font-medium">관리자 계정 생성</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="setup-username" className="text-sm">Username</label>
                    <input id="setup-username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="setup-password" className="text-sm">Password</label>
                    <input id="setup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="setup-password-confirm" className="text-sm">Password 확인</label>
                    <input id="setup-password-confirm" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button onClick={handleCreateAdmin} disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "처리 중..." : "다음"}
                </button>
              </>
            )}

            {step === "storage" && (
              <>
                <p className="text-sm font-medium">스토리지 연결 확인</p>
                <p className="text-xs text-muted-foreground">환경변수로 설정된 스토리지를 확인합니다. 변경하려면 환경변수 수정 후 재시작하세요.</p>
                {storageResult && (
                  <div className={`rounded-md p-3 text-sm ${storageResult.ok ? "bg-green-950 text-green-300" : "bg-destructive/10 text-destructive"}`}>
                    {storageResult.ok ? `연결 성공 (번들 ${storageResult.bundleCount}개 발견, type: ${storageResult.storageType})` : `연결 실패: ${storageResult.error}`}
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button onClick={handleVerifyStorage} disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "확인 중..." : "연결 확인"}
                </button>
                <button onClick={() => setStep("workspace")} className="w-full rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                  건너뛰기
                </button>
              </>
            )}

            {step === "workspace" && (
              <>
                <p className="text-sm font-medium">첫 워크스페이스 생성</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="ws-slug" className="text-sm">Slug (URL 경로)</label>
                    <input id="ws-slug" value={wsSlug} onChange={(e) => setWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="my-workspace" className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ws-name" className="text-sm">이름</label>
                    <input id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="My Workspace" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ws-desc" className="text-sm">설명 (선택)</label>
                    <input id="ws-desc" value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button onClick={handleCreateWorkspace} disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "생성 중..." : "완료"}
                </button>
              </>
            )}

            {step === "done" && (
              <div className="py-4 text-center space-y-2">
                <div className="text-4xl">✓</div>
                <p className="font-medium">설정 완료!</p>
                <p className="text-sm text-muted-foreground">대시보드로 이동합니다...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: WorkspacesPage });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", validateSearch: (search: Record<string, unknown>) => ({ callbackUrl: typeof search.callbackUrl === "string" ? search.callbackUrl : undefined }), component: LoginPage });
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$ws", component: WorkspacePage });
const bundleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$ws/b/$bundleId", component: BundleRoutePage });
const bundleFileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$ws/b/$bundleId/f", validateSearch: (search: Record<string, unknown>) => ({ path: typeof search.path === "string" ? search.path : "" }), component: BundleFileRoutePage });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/setup", component: SetupPage });
const routeTree = rootRoute.addChildren([homeRoute, loginRoute, workspaceRoute, bundleRoute, bundleFileRoute, adminRoute, settingsRoute, setupRoute]);
const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
