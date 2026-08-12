import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownViewer } from "./markdown-viewer";

describe("MarkdownViewer", () => {
  it("keeps relative bundle image sources after sanitization", () => {
    render(
      <MarkdownViewer
        workspaceSlug="infra"
        bundleId="pr-42-run-1"
        currentFilePath="docs/report.md"
        content="![Diagram](../images/diagram.png)"
      />
    );

    expect(screen.getByRole("img", { name: "Diagram" })).toHaveAttribute(
      "src",
      "/api/w/infra/bundles/pr-42-run-1/file?path=images%2Fdiagram.png"
    );
  });

  it("drops unsafe image protocols before custom image resolution", () => {
    render(
      <MarkdownViewer
        workspaceSlug="infra"
        bundleId="pr-42-run-1"
        currentFilePath="docs/report.md"
        content="![Unsafe](javascript:alert(1))"
      />
    );

    expect(screen.queryByRole("img", { name: "Unsafe" })).not.toBeInTheDocument();
  });
});
