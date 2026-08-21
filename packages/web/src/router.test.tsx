import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import {
  BundleFileErrorState,
  BundleMetaQueryState,
  BundleView,
  CheckSetup,
  DefaultNotFoundComponent,
  DefaultRouterErrorComponent,
  getOidcLoginErrorMessage,
  getOidcStartHref,
  SetupPage,
  WorkspacePageContent,
} from "./router";

let mockAuthUser = { id: "user-1", username: "Ada", role: "admin" as "admin" | "user" };
let mockAuthState = {
  user: mockAuthUser as typeof mockAuthUser | null,
  isLoading: false,
  isAuthenticated: true,
  refresh: vi.fn(async () => undefined),
};
let mockLocation = { hash: "", pathname: "/w/infra/b/missing-bundle", searchStr: "" };
const mockNavigate = vi.hoisted(() => vi.fn(async () => undefined));

function setMockAuthUser(user: typeof mockAuthUser) {
  mockAuthUser = user;
  mockAuthState = {
    user,
    isLoading: false,
    isAuthenticated: true,
    refresh: vi.fn(async () => undefined),
  };
}

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  const resolveHref = (to: string, params?: Record<string, string>, search?: Record<string, string | undefined>) => {
    const href = Object.entries(params ?? {}).reduce((nextHref, [key, value]) => nextHref.replace(`$${key}`, value), to);
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(search ?? {})) {
      if (value !== undefined) searchParams.set(key, value);
    }
    const query = searchParams.toString();
    return query ? `${href}?${query}` : href;
  };

  return {
    ...actual,
    Link: ({
      to,
      params,
      search,
      children,
      ...props
    }: React.ComponentProps<"a"> & { to: string; params?: Record<string, string>; search?: Record<string, string | undefined> }) => (
      <a href={resolveHref(to, params, search)} {...props}>
        {children}
      </a>
    ),
    useLocation: () => mockLocation,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => mockAuthState,
  };
});

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("login helpers", () => {
  it("maps supported OIDC errors to safe user-facing messages", () => {
    expect(getOidcLoginErrorMessage("oidc_failed")).toBe(
      "Single sign-on could not be completed. Try again or use another sign-in method."
    );
    expect(getOidcLoginErrorMessage("oidc_forbidden")).toBe(
      "Your single sign-on account is not permitted to access this workspace."
    );
    expect(getOidcLoginErrorMessage("oidc_failed: issuer secret")).toBeNull();
  });

  it("builds a plain OIDC start URL with the callbackUrl encoded once", () => {
    expect(getOidcStartHref("/w/infra?tab=files")).toBe(
      "/api/auth/oidc/start?callbackUrl=%2Fw%2Finfra%3Ftab%3Dfiles"
    );
    expect(getOidcStartHref()).toBe("/api/auth/oidc/start?callbackUrl=%2F");
  });
});

describe("bundle query states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    setMockAuthUser({ id: "user-1", username: "Ada", role: "admin" });
    mockLocation = { hash: "", pathname: "/w/infra/b/missing-bundle", searchStr: "" };
  });

  it("renders the app-level error fallback with recovery actions", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    renderWithQueryClient(<DefaultRouterErrorComponent error={new Error("Render exploded")} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Render exploded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to workspaces" })).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders the default not found fallback with a workspace link", () => {
    renderWithQueryClient(<DefaultNotFoundComponent />);

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("This route does not exist in Evidence Browser.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to workspaces" })).toHaveAttribute("href", "/");
  });

  it("keeps the login route available while setup is incomplete", async () => {
    mockLocation = { hash: "", pathname: "/login", searchStr: "?callbackUrl=%2Fsetup" };
    vi.spyOn(api, "setupStatus").mockResolvedValueOnce({
      needsSetup: true,
      hasAdmin: true,
      hasWorkspace: false,
    });

    renderWithQueryClient(
      <CheckSetup>
        <div>Login form</div>
      </CheckSetup>
    );

    expect(await screen.findByText("Login form")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/setup" });
  });

  it("shows setup loading state instead of an empty screen", () => {
    vi.spyOn(api, "setupStatus").mockReturnValue(new Promise(() => undefined));

    renderWithQueryClient(<SetupPage />);

    expect(screen.getByText("Checking setup status")).toBeInTheDocument();
    expect(screen.getByText("Loading the current setup and sign-in state...")).toBeInTheDocument();
  });

  it("redirects half-finished setup to login with setup callback and visible recovery copy", async () => {
    mockAuthState = {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refresh: vi.fn(async () => undefined),
    };
    vi.spyOn(api, "setupStatus").mockResolvedValueOnce({
      needsSetup: true,
      hasAdmin: true,
      hasWorkspace: false,
    });

    renderWithQueryClient(<SetupPage />);

    expect(await screen.findByText("Sign in required to continue setup")).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", search: { callbackUrl: "/setup" } });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?callbackUrl=%2Fsetup");
  });

  it("resumes setup at storage for an authenticated admin after admin creation", async () => {
    vi.spyOn(api, "setupStatus").mockResolvedValueOnce({
      needsSetup: true,
      hasAdmin: true,
      hasWorkspace: false,
    });

    renderWithQueryClient(<SetupPage />);

    expect(await screen.findByText("Verify storage connection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check connection" })).toBeInTheDocument();
  });

  it("surfaces workspace query failures without redirecting away", async () => {
    setMockAuthUser({ id: "user-2", username: "Grace", role: "user" });
    vi.spyOn(api, "getWorkspaces").mockRejectedValueOnce(new ApiError(503, "Workspace service unavailable"));
    vi.spyOn(api, "getBundles").mockResolvedValueOnce({ bundles: [] });

    renderWithQueryClient(<WorkspacePageContent ws="infra" />);

    expect(await screen.findByText("Failed to load workspace")).toBeInTheDocument();
    expect(screen.getByText("Workspace service unavailable")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("surfaces bundle query failures instead of the empty bundle state", async () => {
    setMockAuthUser({ id: "user-2", username: "Grace", role: "user" });
    vi.spyOn(api, "getWorkspaces").mockResolvedValueOnce({
      workspaces: [{
        id: "workspace-1",
        slug: "infra",
        name: "Infrastructure",
        description: "Ops",
        created_by: "user-1",
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        bundle_count: 0,
      }],
    });
    vi.spyOn(api, "getBundles").mockRejectedValueOnce(new ApiError(500, "Bundle index unavailable"));

    renderWithQueryClient(<WorkspacePageContent ws="infra" />);

    expect(await screen.findByText("Failed to load bundles")).toBeInTheDocument();
    expect(screen.getByText("Bundle index unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No bundles yet")).not.toBeInTheDocument();
  });

  it("shows a not found state with a workspace back link for a missing bundle", () => {
    render(
      <BundleMetaQueryState
        isLoading={false}
        error={new ApiError(404, "Bundle not found")}
        ws="infra"
        bundleId="missing-bundle"
      />
    );

    expect(screen.getByText("Bundle not found")).toBeInTheDocument();
    expect(screen.getByText("missing-bundle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to workspace" })).toHaveAttribute("href", "/w/infra");
    expect(screen.queryByText("Loading bundle...")).not.toBeInTheDocument();
  });

  it("shows a failed bundle state for non-404 load failures", () => {
    render(
      <BundleMetaQueryState
        isLoading={false}
        error={new ApiError(500, "Storage unavailable")}
        ws="infra"
        bundleId="dead-share"
      />
    );

    expect(screen.getByText("Failed to load bundle")).toBeInTheDocument();
    expect(screen.getByText("Storage unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to workspace" })).toHaveAttribute("href", "/w/infra");
  });

  it("shows file load recovery actions when text fetch fails", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <BundleFileErrorState
        filePath="reports/index.md"
        onRetry={onRetry}
        ws="infra"
        bundleId="run-42"
        error={new Error("Network error")}
      />
    );

    expect(screen.getByText("Failed to load file")).toBeInTheDocument();
    expect(screen.getByText("reports/index.md")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to bundle" })).toHaveAttribute("href", "/w/infra/b/run-42");

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the not found state through BundleView when metadata returns 404", async () => {
    vi.spyOn(api, "getBundleMeta").mockRejectedValueOnce(new ApiError(404, "Bundle not found"));

    renderWithQueryClient(<BundleView ws="infra" bundleId="missing-bundle" mode="landing" />);

    expect(await screen.findByText("Bundle not found")).toBeInTheDocument();
    expect(screen.getAllByText("missing-bundle").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "← Back to workspace" })).toHaveAttribute("href", "/w/infra");
    expect(screen.queryByText("Loading bundle...")).not.toBeInTheDocument();
  });

  it("renders the file recovery state through BundleView when file text loading fails", async () => {
    vi.spyOn(api, "getBundleMeta").mockResolvedValueOnce({
      manifest: {
        version: 1,
        title: "Run 42",
        index: "reports/index.md",
        generated_at: "2026-06-24T00:00:00.000Z",
        files: [],
      },
      tree: [],
    });
    vi.spyOn(api, "getBundleFileText").mockRejectedValueOnce(new ApiError(404, "File not found"));

    renderWithQueryClient(<BundleView ws="infra" bundleId="run-42" mode="landing" />);

    expect(await screen.findByText("Failed to load file")).toBeInTheDocument();
    expect(screen.getByText("reports/index.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to bundle" })).toHaveAttribute("href", "/w/infra/b/run-42");
  });

  it("renders a shared bundle through public read APIs and public viewer URLs", async () => {
    vi.spyOn(api, "getSharedBundleMeta").mockResolvedValueOnce({
      manifest: {
        version: 1,
        title: "Shared Run",
        index: "reports/index.md",
        generated_at: "2026-06-24T00:00:00.000Z",
        files: [],
      },
      tree: [
        { name: "reports", path: "reports", type: "directory", children: [
          { name: "index.md", path: "reports/index.md", type: "file" },
        ] },
      ],
    });
    vi.spyOn(api, "getSharedBundleFileText").mockResolvedValueOnce(
      "[Log](../logs/app.log)\n\n![Chart](../images/chart.png)\n\n![Remote](https://example.com/pixel.png)"
    );

    renderWithQueryClient(<BundleView ws="" bundleId="share-token" shareToken="share-token" mode="landing" />);

    expect((await screen.findAllByText("Shared Run")).length).toBeGreaterThan(0);
    expect(api.getSharedBundleMeta).toHaveBeenCalledWith("share-token");
    expect(api.getSharedBundleFileText).toHaveBeenCalledWith("share-token", "reports/index.md");
    expect(await screen.findByRole("link", { name: "Log" })).toHaveAttribute("href", "/s/share-token/f?path=logs%2Fapp.log");
    expect(await screen.findByRole("img", { name: "Chart" })).toHaveAttribute("src", "/api/s/share-token/file?path=images%2Fchart.png");
    expect(await screen.findByRole("img", { name: "Remote" })).toHaveAttribute("referrerPolicy", "no-referrer");
    expect(screen.queryByLabelText("Sign out")).not.toBeInTheDocument();
  });

  it("creates and copies a share link from the authenticated bundle view", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(api, "getBundleMeta").mockResolvedValueOnce({
      manifest: {
        version: 1,
        title: "Run 42",
        index: "reports/index.md",
        generated_at: "2026-06-24T00:00:00.000Z",
        files: [],
      },
      tree: [],
    });
    vi.spyOn(api, "getBundleFileText").mockResolvedValueOnce("# Run 42");
    vi.spyOn(api, "createBundleShareToken").mockResolvedValueOnce({
      token: "public-token",
      shareToken: {
        id: "share-token-id",
        bundle_id: "bundle-internal-id",
        token_prefix: "public-token".slice(0, 12),
        created_by: "user-1",
        expires_at: null,
        revoked_at: null,
        created_at: "2026-06-26T00:00:00Z",
      },
    });

    renderWithQueryClient(<BundleView ws="infra" bundleId="run-42" mode="landing" />);

    await user.click(await screen.findByRole("button", { name: "Copy share link" }));

    expect(api.createBundleShareToken).toHaveBeenCalledWith("infra", "run-42");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/public-token`);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("hides the share link action from non-admin users", async () => {
    setMockAuthUser({ id: "user-2", username: "Grace", role: "user" });
    vi.spyOn(api, "getBundleMeta").mockResolvedValueOnce({
      manifest: {
        version: 1,
        title: "Run 42",
        index: "reports/index.md",
        generated_at: "2026-06-24T00:00:00.000Z",
        files: [],
      },
      tree: [],
    });
    vi.spyOn(api, "getBundleFileText").mockResolvedValueOnce("# Run 42");
    const createShareToken = vi.spyOn(api, "createBundleShareToken");

    renderWithQueryClient(<BundleView ws="infra" bundleId="run-42" mode="landing" />);

    expect((await screen.findAllByText("Run 42")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Copy share link" })).not.toBeInTheDocument();
    expect(createShareToken).not.toHaveBeenCalled();
  });
});
