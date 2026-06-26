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
import { PackageOpen } from "lucide-react";
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
          <Card className="p-10 text-center text-muted-foreground">Admin access is required.</Card>
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
          <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
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
            <Card className="p-10 text-center text-muted-foreground">No workspaces found</Card>
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
  const queryClient = useQueryClient();
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.getWorkspaces, enabled: auth.isAuthenticated });
  const bundlesQuery = useQuery({ queryKey: ["bundles", ws], queryFn: () => api.getBundles(ws), enabled: auth.isAuthenticated });
  const [bundleError, setBundleError] = React.useState("");
  const [deletingBundleId, setDeletingBundleId] = React.useState<string | null>(null);
  const [loadingDemoBundle, setLoadingDemoBundle] = React.useState(false);
  const workspace = workspacesQuery.data?.workspaces.find((item) => item.slug === ws);

  React.useEffect(() => {
    if (!workspacesQuery.isLoading && !workspace) {
      void navigate({ to: "/" });
    }
  }, [navigate, workspace, workspacesQuery.isLoading]);

  async function refreshWorkspaceBundles() {
    await queryClient.invalidateQueries({ queryKey: ["bundles", ws] });
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }

  async function handleDeleteBundle(bundleId: string) {
    if (!window.confirm(`Delete bundle '${bundleId}'?`)) return;

    setBundleError("");
    setDeletingBundleId(bundleId);
    try {
      await api.deleteBundle(ws, bundleId);
      await refreshWorkspaceBundles();
    } catch (err) {
      setBundleError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setDeletingBundleId(null);
    }
  }

  async function handleLoadDemoBundle() {
    setBundleError("");
    setLoadingDemoBundle(true);
    try {
      const { bundle } = await api.loadDemoBundle(ws);
      await refreshWorkspaceBundles();
      await navigate({ to: bundleLandingUrl(ws, bundle.bundle_id) });
    } catch (err) {
      setBundleError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setLoadingDemoBundle(false);
    }
  }

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
              {bundleError && <p className="mb-3 text-sm text-destructive">{bundleError}</p>}
              {bundlesQuery.isLoading ? (
                <Card className="p-10 text-center text-muted-foreground">Loading bundles...</Card>
              ) : bundlesQuery.data?.bundles.length ? (
                <Card className="overflow-hidden p-0">
                  {bundlesQuery.data.bundles.map((bundle) => (
                    <BundleCard
                      key={bundle.id}
                      title={bundle.title || bundle.bundle_id}
                      bundleId={bundle.bundle_id}
                      href={bundleLandingUrl(ws, bundle.bundle_id)}
                      uploadedBy={bundle.uploader_username}
                      createdAt={bundle.created_at}
                      sizeBytes={bundle.size_bytes}
                      canDelete={auth.user?.role === "admin"}
                      isDeleting={deletingBundleId === bundle.bundle_id}
                      onDelete={handleDeleteBundle}
                    />
                  ))}
                </Card>
              ) : (
                <Card className="flex flex-col items-center gap-4 p-10 text-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">No bundles yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Load the sample bundle to preview rendering right away.</p>
                  </div>
                  <Button
                    onClick={() => void handleLoadDemoBundle()}
                    disabled={loadingDemoBundle || auth.user?.role !== "admin"}
                    title={auth.user?.role !== "admin" ? "Only admins can use this" : undefined}
                  >
                    <PackageOpen data-icon="inline-start" />
                    {loadingDemoBundle ? "Loading demo..." : "Load demo bundle"}
                  </Button>
                </Card>
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
  const requiresTextContent = mode === "landing" || activeFileType === "markdown" || activeFileType === "html" || activeFileType === "code" || activeFileType === "text";
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
    if (mode === "landing" && fileType === "markdown") {
      content = <MarkdownViewer content={fileQuery.data ?? ""} workspaceSlug={ws} bundleId={bundleId} currentFilePath={metaQuery.data.manifest.index} />;
    } else if (fileType === "markdown" || fileType === "html" || fileType === "code" || fileType === "text") {
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
          <Card className="p-10 text-center text-muted-foreground">{title} has not been fully migrated to the Vite app yet.</Card>
        </main>
      </div>
    </RequireAuth>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const navGroups = [
    {
      label: "Administration",
      items: [
        { label: "Overview", href: "/admin" },
        { label: "Users", href: "/admin/users" },
        { label: "Workspaces", href: "/admin/workspaces" },
        { label: "API Keys", href: "/admin/api-keys" },
      ],
    },
    {
      label: "System",
      items: [{ label: "Storage / System", href: "/admin/system" }],
    },
    {
      label: "General",
      items: [
        { label: "Back to Workspaces", href: "/" },
        { label: "My Settings", href: "/settings" },
      ],
    },
  ];

  function isAdminPathActive(href: string) {
    if (href === "/admin") return location.pathname === "/admin";
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  }

  return (
    <RequireAuth>
      <RequireAdmin>
        <div className="min-h-screen bg-background">
          <Header title="Admin" userName={auth.user?.username} nav={<Link to="/" className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-white/4 hover:text-foreground">← Workspaces</Link>} />
          <div className="flex min-h-[calc(100vh-3rem)]">
            <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar lg:block">
              <div className="space-y-6 px-4 py-6">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <p className="eyebrow-label mb-3">{group.label}</p>
                    <nav className="space-y-1">
                      {group.items.map((item) => (
                        <SidebarNavItem
                          key={item.href}
                          label={item.label}
                          href={item.href}
                          active={item.href.startsWith("/admin") ? isAdminPathActive(item.href) : false}
                        />
                      ))}
                    </nav>
                  </div>
                ))}
              </div>
            </aside>
            <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">
              <div className="mb-6 space-y-4 rounded-lg border border-border bg-sidebar p-4 lg:hidden">
                {navGroups.map((group) => (
                  <div key={group.label}>
                    <p className="eyebrow-label mb-2">{group.label}</p>
                    <nav className="grid gap-1 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <SidebarNavItem
                          key={item.href}
                          label={item.label}
                          href={item.href}
                          active={item.href.startsWith("/admin") ? isAdminPathActive(item.href) : false}
                        />
                      ))}
                    </nav>
                  </div>
                ))}
              </div>
              <div className="app-fade-up">{children}</div>
            </main>
          </div>
        </div>
      </RequireAdmin>
    </RequireAuth>
  );
}

function AdminSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-end gap-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function AdminQueryState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) {
    return <Card className="p-10 text-center text-muted-foreground">Loading admin data...</Card>;
  }
  if (error) {
    return <Card className="p-10 text-center text-destructive">{error instanceof Error ? error.message : "Failed to load admin data"}</Card>;
  }
  return null;
}

function AdminOverviewPage() {
  const auth = useAuth();
  const enabled = auth.isAuthenticated && auth.user?.role === "admin";
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.getUsers(), enabled });
  const workspacesQuery = useQuery({ queryKey: ["admin", "workspaces"], queryFn: () => api.getWorkspaces(), enabled });
  const keysQuery = useQuery({ queryKey: ["admin", "api-keys"], queryFn: () => api.getAdminApiKeys(), enabled });
  const setupQuery = useQuery({ queryKey: ["setup", "status"], queryFn: () => api.setupStatus(), enabled, staleTime: 60_000 });
  const isLoading = usersQuery.isLoading || workspacesQuery.isLoading || keysQuery.isLoading || setupQuery.isLoading;
  const error = usersQuery.error ?? workspacesQuery.error ?? keysQuery.error ?? setupQuery.error;
  if (isLoading || error) {
    return <AdminShell><AdminQueryState isLoading={isLoading} error={error} /></AdminShell>;
  }

  const users = usersQuery.data?.users ?? [];
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const keys = keysQuery.data?.keys ?? [];
  const now = Date.now();
  const activeKeys = keys.filter((key) => !key.expires_at || new Date(key.expires_at).getTime() > now);
  const riskyKeys = keys.filter((key) => key.scope === "admin" && (!key.expires_at || !key.last_used_at));
  const bundleCount = workspaces.reduce((total, workspace) => total + workspace.bundle_count, 0);
  const summaryCards = [
    { label: "Total users", value: users.length, detail: `${users.filter((user) => user.role === "admin").length} admins` },
    { label: "Workspaces", value: workspaces.length, detail: `${bundleCount} bundles` },
    { label: "Active API keys", value: activeKeys.length, detail: `${riskyKeys.length} risky admin keys` },
    {
      label: "Setup state",
      value: setupQuery.data?.needsSetup ? "Incomplete" : "Ready",
      detail: setupQuery.data?.hasWorkspace ? "Workspace configured" : "Workspace missing",
    },
  ];
  const actions = [
    { label: "Create user", href: "/admin/users", detail: "Manage account access and roles." },
    { label: "Create workspace", href: "/admin/workspaces", detail: "Configure evidence spaces." },
    { label: "Create API key", href: "/admin/api-keys", detail: "Issue machine access keys." },
    { label: "View system status", href: "/admin/system", detail: "Check setup and storage state." },
  ];

  return (
    <AdminShell>
      <div className="space-y-8">
        <AdminSectionHeader title="Overview" description="Operational summary and entry points for admin management." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <Card key={card.label} className="p-4">
              <p className="text-[12px] font-medium uppercase text-muted-foreground">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold">{card.value}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{card.detail}</p>
            </Card>
          ))}
        </div>
        <section className="space-y-3">
          <h3 className="text-[15px] font-semibold">Management surfaces</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                to={action.href}
                className="rounded-lg border border-border p-4 transition-colors duration-150 hover:border-[oklch(1_0_0/16%)] hover:bg-[oklch(0.14_0_0)]"
              >
                <span className="text-[14px] font-medium text-foreground">{action.label}</span>
                <span className="mt-1 block text-[13px] text-muted-foreground">{action.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function AdminUsersPage() {
  const auth = useAuth();
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.getUsers(),
    enabled: auth.isAuthenticated && auth.user?.role === "admin",
  });
  const isLoading = usersQuery.isLoading;
  const error = usersQuery.error;
  return (
    <AdminShell>
      {isLoading || error ? <AdminQueryState isLoading={isLoading} error={error} /> : (
        <section className="space-y-4">
          <AdminSectionHeader title="Users" description="Manage account access, roles, and user lifecycle actions." />
          <UserList users={usersQuery.data?.users ?? []} />
        </section>
      )}
    </AdminShell>
  );
}

function AdminWorkspacesPage() {
  const auth = useAuth();
  const workspacesQuery = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => api.getWorkspaces(),
    enabled: auth.isAuthenticated && auth.user?.role === "admin",
  });
  const isLoading = workspacesQuery.isLoading;
  const error = workspacesQuery.error;
  return (
    <AdminShell>
      {isLoading || error ? <AdminQueryState isLoading={isLoading} error={error} /> : (
        <section className="space-y-4">
          <AdminSectionHeader title="Workspaces" description="Create, edit, and remove evidence workspaces." />
          <WorkspaceManager workspaces={workspacesQuery.data?.workspaces ?? []} />
        </section>
      )}
    </AdminShell>
  );
}

function AdminApiKeysPage() {
  const auth = useAuth();
  const enabled = auth.isAuthenticated && auth.user?.role === "admin";
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.getUsers(), enabled });
  const keysQuery = useQuery({ queryKey: ["admin", "api-keys"], queryFn: () => api.getAdminApiKeys(), enabled });
  const isLoading = usersQuery.isLoading || keysQuery.isLoading;
  const error = usersQuery.error ?? keysQuery.error;
  return (
    <AdminShell>
      {isLoading || error ? <AdminQueryState isLoading={isLoading} error={error} /> : (
        <section className="space-y-4">
          <AdminSectionHeader title="API Keys" description="Manage CLI, MCP, upload, and admin access keys." />
          <ApiKeyManager initialKeys={keysQuery.data?.keys ?? []} users={usersQuery.data?.users ?? []} />
        </section>
      )}
    </AdminShell>
  );
}

function AdminSystemPage() {
  const auth = useAuth();
  const [storageResult, setStorageResult] = React.useState<{ ok: boolean; storageType?: string; bundleCount?: number; error?: string } | null>(null);
  const [storageLoading, setStorageLoading] = React.useState(false);
  const [storageError, setStorageError] = React.useState("");
  const setupQuery = useQuery({
    queryKey: ["setup", "status"],
    queryFn: () => api.setupStatus(),
    enabled: auth.isAuthenticated && auth.user?.role === "admin",
    staleTime: 60_000,
  });
  const isLoading = setupQuery.isLoading;
  const error = setupQuery.error;

  async function handleVerifyStorage() {
    setStorageLoading(true);
    setStorageError("");
    try {
      setStorageResult(await api.setupVerifyStorage());
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : "Failed to verify storage");
    } finally {
      setStorageLoading(false);
    }
  }

  return (
    <AdminShell>
      {isLoading || error ? <AdminQueryState isLoading={isLoading} error={error} /> : (
        <div className="space-y-6">
          <AdminSectionHeader title="Storage / System" description="Instance setup and storage visibility using existing system checks." />
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-[12px] font-medium uppercase text-muted-foreground">Setup</p>
              <p className="mt-3 text-lg font-semibold">{setupQuery.data?.needsSetup ? "Incomplete" : "Complete"}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Admin account {setupQuery.data?.hasAdmin ? "configured" : "missing"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[12px] font-medium uppercase text-muted-foreground">Workspace seed</p>
              <p className="mt-3 text-lg font-semibold">{setupQuery.data?.hasWorkspace ? "Configured" : "Missing"}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Initial evidence workspace state</p>
            </Card>
            <Card className="p-4">
              <p className="text-[12px] font-medium uppercase text-muted-foreground">Runtime</p>
              <p className="mt-3 text-lg font-semibold">Browser API</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Connected through the current session</p>
            </Card>
          </div>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-semibold">Storage health</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">Runs the existing storage verification check without exposing secrets.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleVerifyStorage()} disabled={storageLoading}>
                {storageLoading ? "Checking..." : "Verify storage"}
              </Button>
            </div>
            {storageError && <Card className="p-4 text-[13px] text-destructive">{storageError}</Card>}
            {storageResult && (
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={storageResult.ok ? "green" : "red"}>{storageResult.ok ? "Healthy" : "Failed"}</Badge>
                  <span className="text-[13px] text-muted-foreground">Type: {storageResult.storageType ?? "unknown"}</span>
                  <span className="text-[13px] text-muted-foreground">Bundles: {storageResult.bundleCount ?? 0}</span>
                </div>
                {storageResult.error && <p className="mt-3 text-[13px] text-destructive">{storageResult.error}</p>}
              </Card>
            )}
          </section>
        </div>
      )}
    </AdminShell>
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
          title="My Settings"
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
                    <h2 className="text-xl font-semibold">My API Keys</h2>
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

  const auth = useAuth();
  const [step, setStep] = React.useState<SetupStep | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Determine initial step once status and auth are known
  React.useEffect(() => {
    if (setupQuery.isLoading || auth.isLoading || step !== null) return;
    if (setupQuery.data && !setupQuery.data.needsSetup) {
      void navigate({ to: "/" });
    } else if (setupQuery.data?.hasAdmin && !auth.isAuthenticated) {
      // Admin exists but not logged in — must authenticate before completing setup
      void navigate({ to: "/login", search: { callbackUrl: "/setup" } });
    } else {
      setStep(setupQuery.data?.hasAdmin ? "storage" : "admin");
    }
  }, [setupQuery.isLoading, setupQuery.data, auth.isLoading, auth.isAuthenticated, step, navigate]);

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
    if (password !== passwordConfirm) { setError("Passwords do not match"); return; }
    if (password.length < 4) { setError("Password must be at least 4 characters"); return; }
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
      if (data.ok) {
        timerRef.current = setTimeout(() => setStep("workspace"), 800);
      }
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
      timerRef.current = setTimeout(() => { void navigate({ to: "/" }); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally { setLoading(false); }
  }

  const steps: { key: SetupStep; label: string }[] = [
    { key: "admin", label: "Admin account" },
    { key: "storage", label: "Storage" },
    { key: "workspace", label: "Workspace" },
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
            <p className="mt-2 text-sm text-muted-foreground">Complete the initial setup</p>
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
                <p className="text-sm font-medium">Create an admin account</p>
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
                    <label htmlFor="setup-password-confirm" className="text-sm">Confirm password</label>
                    <input id="setup-password-confirm" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button onClick={handleCreateAdmin} disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "Processing..." : "Next"}
                </button>
              </>
            )}

            {step === "storage" && (
              <>
                <p className="text-sm font-medium">Verify storage connection</p>
                <p className="text-xs text-muted-foreground">Checks the storage configured through environment variables. To change it, update the environment and restart.</p>
                {storageResult && (
                  <div className={`rounded-md p-3 text-sm ${storageResult.ok ? "bg-green-950 text-green-300" : "bg-destructive/10 text-destructive"}`}>
                    {storageResult.ok ? `Connection successful (${storageResult.bundleCount} bundles found, type: ${storageResult.storageType})` : `Connection failed: ${storageResult.error}`}
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button onClick={handleVerifyStorage} disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "Checking..." : "Check connection"}
                </button>
                <button onClick={() => setStep("workspace")} className="w-full rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                  Skip
                </button>
              </>
            )}

            {step === "workspace" && (
              <>
                <p className="text-sm font-medium">Create your first workspace</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="ws-slug" className="text-sm">Slug (URL path)</label>
                    <input id="ws-slug" value={wsSlug} onChange={(e) => setWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="my-workspace" className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ws-name" className="text-sm">Name</label>
                    <input id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="My Workspace" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ws-desc" className="text-sm">Description (optional)</label>
                    <input id="ws-desc" value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <button onClick={handleCreateWorkspace} disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "Creating..." : "Finish"}
                </button>
              </>
            )}

            {step === "done" && (
              <div className="py-4 text-center space-y-2">
                <div className="text-4xl">✓</div>
                <p className="font-medium">Setup complete.</p>
                <p className="text-sm text-muted-foreground">Opening the dashboard...</p>
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
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminOverviewPage });
const adminUsersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/users", component: AdminUsersPage });
const adminWorkspacesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/workspaces", component: AdminWorkspacesPage });
const adminApiKeysRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/api-keys", component: AdminApiKeysPage });
const adminSystemRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/system", component: AdminSystemPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/setup", component: SetupPage });
const routeTree = rootRoute.addChildren([
  homeRoute,
  loginRoute,
  workspaceRoute,
  bundleRoute,
  bundleFileRoute,
  adminRoute,
  adminUsersRoute,
  adminWorkspacesRoute,
  adminApiKeysRoute,
  adminSystemRoute,
  settingsRoute,
  setupRoute,
]);
const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
