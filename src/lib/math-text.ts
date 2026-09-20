import katex from "katex";

/**
 * The `$...$` math convention, in one place.
 *
 * The extractor stores math as `$latex$` (see scripts/extract_questions.py) so
 * the stored question HTML stays small and provider-agnostic; every renderer
 * here turns those runs into KaTeX. Both the plain-text path (MathText) and the
 * rich path (QuestionText) split the same way, so they can never disagree.
 */

export type MathPart =
  | { math: true; value: string }
  | { math: false; value: string };

const MATH_RE = /(\\\$|\$(?:\\.|[^$\\])+\$)/g;

/** Split text into plain runs and `$...$` math runs. */
export function splitMath(text: string): MathPart[] {
  if (!text) return [];
  return text.replace(/(_{3,})\s*blank\b/gi, "$1")
    .split(MATH_RE)
    .filter((part) => part !== "")
    .map((part) =>
      part.length > 2 && part.startsWith("$") && part.endsWith("$")
        ? ({ math: true, value: part.slice(1, -1) } as const)
        : ({ math: false, value: part === "\\$" ? "$" : part } as const)
    );
}

/** KaTeX markup for one math run, or the original text if KaTeX chokes. */
export function mathToHtml(tex: string): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: false });
  } catch {
    return `$${tex}$`;
  }
}

/** Escape plain text for HTML output. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render a plain-text string to HTML, KaTeX-ing its `$...$` runs. */
export function mathTextToHtml(text: string): string {
  return splitMath(text)
    .map((part) => (part.math ? mathToHtml(part.value) : escapeHtml(part.value)))
    .join("");
}

/**
 * Render the `$...$` runs inside stored question markup, leaving tags and
 * attributes untouched. The text runs are already HTML-escaped on the way in
 * (scripts/rich_html.py), so they pass through verbatim.
 *
 * <svg> subtrees are skipped: their labels are plain Unicode, and injecting
 * KaTeX markup into an SVG text node would break the graph.
 */
export function richToHtml(markup: string): string {
  // Stored rich question fragments are sanitized during import. Keep a final
  // render-time tripwire so a bad database write cannot become executable HTML.
  if (
    /<\s*(?:script|iframe|object|embed|foreignobject|form|input|button|textarea|select|template|canvas|audio|video|animate|set)\b/i.test(markup) ||
    /\s+on[a-z]+\s*=/i.test(markup) ||
    /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(markup)
  ) {
    return "";
  }
  if (!markup.includes("$")) return markup;
  return markup
    .split(/(<svg[\s\S]*?<\/svg>)/i)
    .map((segment, i) => {
      if (i % 2 === 1) return segment;
      return segment.replace(/(^|>)([^<]*)/g, (_m, lead: string, text: string) =>
        text.includes("$")
          ? lead +
            splitMath(text)
              .map((part) => (part.math ? mathToHtml(part.value) : part.value))
              .join("")
          : lead + text
      );
    })
    .join("");
}
