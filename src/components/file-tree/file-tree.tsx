"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { TreeNodeComponent } from "./tree-node";
import { useTree } from "./tree-context";
import type { TreeNode } from "@/lib/bundle/types";

interface FileTreeProps {
  tree: TreeNode[];
  bundleId?: string;
}

export function FileTree({ tree, bundleId: bundleLabel }: FileTreeProps) {
  const { bundleId } = useTree();

  return (
    <ScrollArea className="h-full">
      <div className="border-b border-border px-4 py-3">
        <p className="eyebrow-label">Files</p>
        <p className="mt-2 truncate text-sm font-medium text-foreground">{bundleLabel ?? bundleId}</p>
      </div>
      <nav className="py-2" aria-label="File tree">
        <ul role="tree" className="text-sm">
          {tree.map((node) => (
            <TreeNodeComponent
              key={node.path}
              node={node}
              level={0}
              bundleId={bundleId}
            />
          ))}
        </ul>
      </nav>
    </ScrollArea>
  );
}
