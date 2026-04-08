"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import Link from "next/link";
import { bundleFileUrl, apiBundleUrl } from "@/lib/url";
import type { Components } from "react-markdown";

function resolveRelativePath(currentFilePath: string, href: string): string {
  if (href.startsWith("/")) return href.slice(1);

  const dir = currentFilePath.includes("/")
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf("/"))
    : "";

  const parts = [...dir.split("/").filter(Boolean), ...href.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== ".") resolved.push(part);
  }
  return resolved.join("/");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-]/gu, "");
}

// Allow className on code elements for syntax highlighting.
// Remove protocol restriction on img[src] so relative bundle-internal
// paths (e.g. "screenshots/step-1.png") are not stripped by sanitization.
const { src: _src, ...protocolsWithoutSrc } = defaultSchema.protocols ?? {};
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
  },
  protocols: protocolsWithoutSrc,
};

interface MarkdownViewerProps {
  content: string;
  workspaceSlug: string;
  bundleId: string;
  currentFilePath: string;
}

export function MarkdownViewer({
  content,
  workspaceSlug,
  bundleId,
  currentFilePath,
}: MarkdownViewerProps) {

  const components: Components = {
    a({ href, children, ...props }) {
      if (!href) {
        return <a {...props}>{children}</a>;
      }

      // External links
      if (href.startsWith("http://") || href.startsWith("https://")) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        );
      }

      // Anchor links
      if (href.startsWith("#")) {
        return (
          <a href={href} {...props}>
            {children}
          </a>
        );
      }

      // Internal bundle links
      const resolvedPath = resolveRelativePath(currentFilePath, href);
      return (
        <Link href={bundleFileUrl(workspaceSlug, bundleId, resolvedPath)} {...props}>
          {children}
        </Link>
      );
    },

    img({ src, alt, ...props }) {
      if (!src || typeof src !== "string") return null;

      // External images
      if (src.startsWith("http://") || src.startsWith("https://")) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? ""} className="max-w-full" {...props} />
        );
      }

      // Internal images
      const resolvedPath = resolveRelativePath(currentFilePath, src);
      const apiSrc = `${apiBundleUrl(workspaceSlug, bundleId, "file")}?path=${encodeURIComponent(resolvedPath)}`;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={apiSrc} alt={alt ?? ""} className="max-w-full" {...props} />
      );
    },

    h1({ children, ...props }) {
      const text = extractText(children);
      const id = slugify(text);
      return (
        <h1 id={id} {...props}>
          {children}
        </h1>
      );
    },
    h2({ children, ...props }) {
      const text = extractText(children);
      const id = slugify(text);
      return (
        <h2 id={id} {...props}>
          {children}
        </h2>
      );
    },
    h3({ children, ...props }) {
      const text = extractText(children);
      const id = slugify(text);
      return (
        <h3 id={id} {...props}>
          {children}
        </h3>
      );
    },
    h4({ children, ...props }) {
      const text = extractText(children);
      const id = slugify(text);
      return (
        <h4 id={id} {...props}>
          {children}
        </h4>
      );
    },
    h5({ children, ...props }) {
      const text = extractText(children);
      const id = slugify(text);
      return (
        <h5 id={id} {...props}>
          {children}
        </h5>
      );
    },
    h6({ children, ...props }) {
      const text = extractText(children);
      const id = slugify(text);
      return (
        <h6 id={id} {...props}>
          {children}
        </h6>
      );
    },

    code({ className, children, ...props }) {
      // Fenced code blocks get a className like "language-js"
      const match = className?.match(/language-(\w+)/);
      if (match) {
        return (
          <code
            className={`${className} block overflow-x-auto rounded bg-muted p-4 text-sm`}
            {...props}
          >
            {children}
          </code>
        );
      }
      // Inline code
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    },

    pre({ children, ...props }) {
      return (
        <pre className="overflow-x-auto rounded-lg bg-muted p-0 my-4" {...props}>
          {children}
        </pre>
      );
    },

    table({ children, ...props }) {
      return (
        <div className="overflow-x-auto my-4">
          <table
            className="w-full border-collapse text-sm"
            {...props}
          >
            {children}
          </table>
        </div>
      );
    },

    th({ children, ...props }) {
      return (
        <th
          className="border border-border px-3 py-2 text-left font-semibold bg-muted"
          {...props}
        >
          {children}
        </th>
      );
    },

    td({ children, ...props }) {
      return (
        <td className="border border-border px-3 py-2" {...props}>
          {children}
        </td>
      );
    },

    blockquote({ children, ...props }) {
      return (
        <blockquote
          className="border-l-4 border-border pl-4 italic text-muted-foreground my-4"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
  };

  return (
    <article className="prose prose-sm max-w-none dark:prose-invert prose-code:before:content-none prose-code:after:content-none px-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}

/** Recursively extract text from React children */
function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}
