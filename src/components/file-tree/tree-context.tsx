"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

interface TreeContextValue {
  expandedPaths: Set<string>;
  currentFilePath: string | null;
  bundleId: string;
  toggleFolder: (path: string) => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);

function getParentPaths(filePath: string): string[] {
  const parts = filePath.split("/");
  const paths: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    paths.push(parts.slice(0, i).join("/"));
  }
  return paths;
}

interface TreeProviderProps {
  children: ReactNode;
  bundleId: string;
  currentFilePath: string | null;
  initialExpandedPaths?: string[];
}

export function TreeProvider({
  children,
  bundleId,
  currentFilePath,
  initialExpandedPaths = [],
}: TreeProviderProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(initialExpandedPaths)
  );

  // Auto-expand path to current file when it changes
  useEffect(() => {
    if (!currentFilePath) return;
    const parents = getParentPaths(currentFilePath);
    if (parents.length === 0) return;

    setExpandedPaths((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const p of parents) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentFilePath]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <TreeContext.Provider
      value={{ expandedPaths, currentFilePath, bundleId, toggleFolder }}
    >
      {children}
    </TreeContext.Provider>
  );
}

export function useTree(): TreeContextValue {
  const ctx = useContext(TreeContext);
  if (!ctx) {
    throw new Error("useTree must be used within a TreeProvider");
  }
  return ctx;
}
