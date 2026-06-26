import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { BundleFileErrorState, BundleMetaQueryState, BundleView } from "./router";

let mockAuthUser = { id: "user-1", username: "Ada", role: "admin" as "admin" | "user" };

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  const resolveHref = (to: string, params?: Record<string, string>) =>
    Object.entries(params ?? {}).reduce((href, [key, value]) => href.replace(`$${key}`, value), to);

  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...props
    }: React.ComponentProps<"a"> & { to: string; params?: Record<string, string> }) => (
      <a href={resolveHref(to, params)} {...props}>
        {children}
      </a>
    ),
    useLocation: () => ({ hash: "", pathname: "/w/infra/b/missing-bundle", searchStr: "" }),
    useNavigate: () => vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({
      user: mockAuthUser,
      isLoading: false,
      isAuthenticated: true,
      refresh: vi.fn(async () => undefined),
    }),
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

describe("bundle query states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuthUser = { id: "user-1", username: "Ada", role: "admin" };
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
    mockAuthUser = { id: "user-2", username: "Grace", role: "user" };
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
