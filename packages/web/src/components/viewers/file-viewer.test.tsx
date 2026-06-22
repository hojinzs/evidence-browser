import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileViewer } from "./file-viewer";

vi.mock("shiki/bundle/web", () => ({
  codeToHtml: vi.fn(async (content: string) => `<pre><code>${content}</code></pre>`),
}));

describe("FileViewer", () => {
  it("routes HTML files to HtmlViewer", () => {
    render(
      <FileViewer
        workspaceSlug="infra"
        bundleId="pr-42-run-1"
        filePath="reports/index.html"
        content="<h1>Report</h1>"
      />
    );

    expect(screen.getByTitle("HTML preview: reports/index.html")).toHaveAttribute(
      "src",
      "/api/w/infra/bundles/pr-42-run-1/preview?path=reports%2Findex.html"
    );
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
  });
});
