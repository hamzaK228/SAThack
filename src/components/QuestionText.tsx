"use client";

import { useMemo } from "react";
import MathText from "@/components/MathText";
import { richToHtml } from "@/lib/math-text";

/**
 * Question content — the one way to render a stem, passage, choice or rationale.
 *
 * When the extractor found a graph or a table in the source HTML it stored a
 * sanitized copy in `*_html` (see scripts/rich_html.py); that copy is injected
 * here and its `$...$` math is KaTeX'd. Otherwise we fall back to the plain-text
 * column through MathText, which is exactly what the app did before rich media
 * existed.
 */
export default function QuestionText({
  html,
  text,
  className,
}: {
  html?: string | null;
  text: string | null | undefined;
  className?: string;
}) {
  const markup = useMemo(() => (html ? richToHtml(html) : null), [html]);

  if (markup) {
    return (
      <div
        className={className ? `rich ${className}` : "rich"}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }

  return <MathText text={text ?? ""} />;
}
