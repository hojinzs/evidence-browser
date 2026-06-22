import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HtmlViewer } from "./html-viewer";

vi.mock("shiki/bundle/web", () => ({
  codeToHtml: vi.fn(async (content: string) => {
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return `<pre><code>${escaped}</code></pre>`;
  }),
}));

const maliciousHtml = `
<button onclick="window.evidencePwned = true">Run</button>
<script>window.evidencePwned = true</script>
<iframe src="https://evil.example/frame.html"></iframe>
<img src="https://evil.example/pixel.png">
<script src="https://evil.example/payload.js"></script>
`;

describe("HtmlViewer", () => {
  it("renders the sandboxed preview by default", () => {
    render(
      <HtmlViewer
        workspaceSlug="infra"
        bundleId="pr-42-run-1"
        filePath="reports/index.html"
        content={maliciousHtml}
      />
    );

    const frame = screen.getByTitle("HTML preview: reports/index.html");
    expect(frame).toHaveAttribute(
      "src",
      "/api/w/infra/bundles/pr-42-run-1/preview?path=reports%2Findex.html"
    );
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches from preview to source view", async () => {
    const user = userEvent.setup();
    render(
      <HtmlViewer
        workspaceSlug="infra"
        bundleId="pr-42-run-1"
        filePath="reports/index.html"
        content={maliciousHtml}
      />
    );

    await user.click(screen.getByRole("button", { name: "Source" }));

    expect(screen.queryByTitle("HTML preview: reports/index.html")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText(/window\.evidencePwned/)).toBeInTheDocument();
  });
});
