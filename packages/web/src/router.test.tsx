import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { BundleFileErrorState, BundleMetaQueryState, BundleView } from "./router";

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
      user: { id: "user-1", username: "Ada", role: "admin" },
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
});
