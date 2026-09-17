"use client";

import { useMemo } from "react";
import { mathTextToHtml } from "@/lib/math-text";

/**
 * Renders text with inline `$...$` LaTeX math using KaTeX.
 * Non-math text is output as plain text (newlines preserved via CSS).
 *
 * Question content that may carry a graph or a table should go through
 * QuestionText instead — this is the plain-text path.
 */
export default function MathText({ text }: { text: string | null | undefined }) {
  const html = useMemo(() => (text ? mathTextToHtml(text) : ""), [text]);

  return <span className="mathtext" dangerouslySetInnerHTML={{ __html: html }} />;
}
