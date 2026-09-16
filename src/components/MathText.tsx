"use client";

import katex from "katex";
import { useMemo } from "react";

/**
 * Renders text with inline `$...$` LaTeX math using KaTeX.
 * Non-math text is output as plain text (newlines preserved via CSS).
 */
export default function MathText({ text }: { text: string }) {
  const html = useMemo(() => {
    if (!text) return "";
    const parts = text.split(/(\$[^$]+\$)/g);
    return parts
      .map((part) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          const tex = part.slice(1, -1);
          try {
            return katex.renderToString(tex, { throwOnError: false, displayMode: false });
          } catch {
            return part;
          }
        }
        return part
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      })
      .join("");
  }, [text]);

  return <span className="mathtext" dangerouslySetInnerHTML={{ __html: html }} />;
}
