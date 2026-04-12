"use client";

import { memo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, FileCode, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTree } from "./tree-context";
import { bundleFileUrl } from "@/lib/url";
import type { TreeNode } from "@/lib/bundle/types";

function getFileIcon(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);
  const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".css", ".scss", ".html", ".xml", ".yaml", ".yml", ".toml", ".sh", ".bash", ".sql", ".graphql", ".json", ".jsonl", ".dockerfile"]);
  if (imageExts.has(ext)) return Image;
  if (codeExts.has(ext)) return FileCode;
  return FileText;
}

interface TreeNodeProps {
  node: TreeNode;
  level: number;
  bundleId: string;
}

export const TreeNodeComponent = memo(function TreeNodeComponent({ node, level, bundleId }: TreeNodeProps) {
  const navigate = useNavigate();
  const { expandedPaths, currentFilePath, workspaceSlug, toggleFolder } = useTree();
  const isDirectory = node.type === "directory";
  const isExpanded = expandedPaths.has(node.path);
  const isActive = currentFilePath === node.path;
  const paddingLeft = 8 + level * 16;

  const handleClick = () => {
    if (isDirectory) {
      toggleFolder(node.path);
    } else {
      void navigate({ to: bundleFileUrl(workspaceSlug, bundleId, node.path) });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const FileIcon = isDirectory ? (isExpanded ? FolderOpen : Folder) : getFileIcon(node.name);

  return (
    <li role="treeitem" aria-expanded={isDirectory ? isExpanded : undefined}>
      <div
        className={cn("flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] transition-colors duration-150", "hover:bg-white/4", isActive && "bg-white/7 font-medium text-foreground shadow-[inset_2px_0_0_0_var(--primary)]")}
        style={{ paddingLeft }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
      >
        {isDirectory && (
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          </span>
        )}
        {!isDirectory && <span className="w-4 flex-shrink-0" />}
        <FileIcon className={cn("size-4 flex-shrink-0", isDirectory ? "text-primary" : "text-muted-foreground")} />
        <span className="truncate">{node.name}</span>
      </div>
      {isDirectory && isExpanded && node.children && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeNodeComponent key={child.path} node={child} level={level + 1} bundleId={bundleId} />
          ))}
        </ul>
      )}
    </li>
  );
});
