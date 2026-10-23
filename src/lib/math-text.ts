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

/**
 * Some stored text uses `$` as a literal dollar sign ("costs $60 per hour …
 * costs $15"), which the `$...$` convention would pair into one giant bogus
 * math run. Real LaTeX in this corpus always carries a backslash command or
 * wraps single tokens, so a "math" run of spaced lowercase words with no
 * backslash is prose — render it literally, dollars included.
 */
function isProseRun(content: string): boolean {
  return !content.includes("\\") && /[a-z]{3,} [a-z]{3,}/.test(content);
}

/** Split text into plain runs and `$...$` math runs. */
export function splitMath(text: string): MathPart[] {
  if (!text) return [];
  return text.replace(/(_{3,})\s*blank\b/gi, "$1")
    .split(MATH_RE)
    .filter((part) => part !== "")
    .map((part) =>
      part.length > 2 && part.startsWith("$") && part.endsWith("$")
        ? isProseRun(part.slice(1, -1))
          ? ({ math: false, value: part } as const)
          : ({ math: true, value: part.slice(1, -1) } as const)
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

/**
 * LLM chat answers arrive as Markdown even when the prompt forbids it, and the
 * chat bubbles render plain text — so `**bold**` shows up as literal asterisks.
 * Convert the harmless decorations after HTML-escaping: escaped text cannot
 * contain < or >, so the only markup this can emit is strong/em/code tags and
 * literal bullet characters. Unsupported syntax (links, headings level text,
 * tables) degrades to the plain text a student can still read.
 */
function decorateEscapedText(escaped: string): string {
  return escaped
    .replace(/(^|\n)#{1,6}\s+/g, "$1") // "### Heading" → plain line
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/(^|\n)\s*[-*]\s+/g, "$1• ");
}

/** Render a plain-text string to HTML, KaTeX-ing its `$...$` runs. */
export function mathTextToHtml(text: string): string {
  return splitMath(text)
    .map((part) => (part.math ? mathToHtml(part.value) : decorateEscapedText(escapeHtml(part.value))))
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
