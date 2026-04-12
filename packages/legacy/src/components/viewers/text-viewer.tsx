"use client";

interface TextViewerProps {
  content: string;
}

export function TextViewer({ content }: TextViewerProps) {
  const lines = content.split("\n");
  const gutterWidth = String(lines.length).length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.24)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="transition-colors duration-150 hover:bg-white/3">
                <td
                  className="sticky left-0 select-none border-r border-border bg-white/3 px-3 py-0 text-right font-mono text-xs text-muted-foreground align-top"
                  style={{ minWidth: `${gutterWidth + 2}ch` }}
                >
                  {i + 1}
                </td>
                <td className="px-4 py-0 whitespace-pre font-mono text-sm">
                  {line || "\u00A0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
