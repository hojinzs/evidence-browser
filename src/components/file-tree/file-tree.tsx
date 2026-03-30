"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { TreeNodeComponent } from "./tree-node";
import { useTree } from "./tree-context";
import type { TreeNode } from "@/lib/bundle/types";

interface FileTreeProps {
  tree: TreeNode[];
}

export function FileTree({ tree }: FileTreeProps) {
  const { bundleId } = useTree();

  return (
    <ScrollArea className="h-full">
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
