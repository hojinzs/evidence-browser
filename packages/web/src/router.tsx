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
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
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

const rootRoute = createRootRoute({ component: RootLayout });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: WorkspacesPage });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", validateSearch: (search: Record<string, unknown>) => ({ callbackUrl: typeof search.callbackUrl === "string" ? search.callbackUrl : undefined }), component: LoginPage });
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$ws", component: WorkspacePage });
const bundleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$ws/b/$bundleId", component: BundleRoutePage });
const bundleFileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$ws/b/$bundleId/f", validateSearch: (search: Record<string, unknown>) => ({ path: typeof search.path === "string" ? search.path : "" }), component: BundleFileRoutePage });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const routeTree = rootRoute.addChildren([homeRoute, loginRoute, workspaceRoute, bundleRoute, bundleFileRoute, adminRoute, settingsRoute]);
const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
