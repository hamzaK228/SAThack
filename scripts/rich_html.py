"""
Turn the College Board question HTML into a safe, renderable fragment.

The API returns each question's `stem` / `stimulus` / `rationale` as HTML that
mixes three kinds of content:

  * prose           - <p>, <em>, entities
  * <math> MathML   - converted to `$...$` by extract_questions.convert_math_in_html
  * embedded media  - matplotlib <svg> graphs and <table> data tables

`extract_questions.html_to_text()` collapsed all of it to plain text, which
silently deleted every graph and table (an <svg> was replaced by its aria-label,
so the page showed a *description* of a graph instead of the graph).

This module keeps those media fragments intact while stripping anything that
could execute or escape the layout. It runs at extraction time, so the HTML
stored in `questions.question_text_html` / `questions.passage_html` is already
safe for the client to inject.

Rules:
  * Tag allowlist - everything else is dropped, with its subtree.
  * Attribute allowlist per context, no `on*` handlers ever, no `javascript:`.
  * `style` attributes and <style> blocks survive INSIDE <svg> only: matplotlib
    paints with them, and CSS inside an inline SVG cannot execute script. HTML
    outside SVG loses its inline styles and is styled by our own CSS instead.
  * <foreignObject> (HTML inside SVG), <script>, <iframe>, <object>... dropped.
  * If nothing but plain text would remain, the caller stores NULL and the app
    keeps rendering the plain-text columns exactly as before.
"""

from __future__ import annotations

import html as html_mod
import re
from html.parser import HTMLParser

# Something we would lose by falling back to plain text.
GRAPHIC_RE = re.compile(r"<(svg|img|table|figure)\b", re.IGNORECASE)

SAFE_URL_RE = re.compile(r"^(?:#|data:image/|https://)", re.IGNORECASE)
BAD_URL_RE = re.compile(r"^\s*(?:javascript|vbscript|data:text/html)", re.IGNORECASE)
CSS_URL_RE = re.compile(r"url\(\s*['\"]?([^'\")]+)", re.IGNORECASE)
CSS_UNSAFE_RE = re.compile(r"@import|expression\(|behavior\s*:", re.IGNORECASE)
XML_NOISE_RE = re.compile(r"<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--.*?-->", re.DOTALL | re.IGNORECASE)

VOID = {"br", "hr", "img", "area", "base", "col", "embed", "input", "link",
        "meta", "source", "track", "wbr", "param"}

# Tags dropped together with everything inside them.
DROP_SUBTREE = {
    "script", "style", "iframe", "object", "embed", "link", "meta", "head", "title",
    "form", "input", "button", "textarea", "select", "option", "canvas", "audio",
    "video", "source", "track", "template", "noscript", "base", "applet",
    "foreignobject", "animate", "animatemotion", "animatetransform", "set",
    "discard", "handler", "listener",
}

ALLOWED_OUTSIDE_SVG = {
    "p", "br", "span", "em", "strong", "b", "i", "u", "s", "sup", "sub", "small",
    "mark", "code", "kbd", "samp", "var", "abbr", "cite", "q", "blockquote", "hr",
    "div", "figure", "figcaption", "table", "caption", "thead", "tbody", "tfoot",
    "tr", "th", "td", "colgroup", "col", "ul", "ol", "li", "dl", "dt", "dd",
    "img",
}

ALLOWED_IN_SVG = {
    "svg", "g", "defs", "style", "desc", "title", "use", "path", "rect", "circle",
    "ellipse", "line", "polyline", "polygon", "text", "tspan", "textpath", "image",
    "clippath", "lineargradient", "radialgradient", "stop", "symbol", "marker",
    "pattern", "mask", "metadata",
}

# Attributes allowed on non-SVG elements.
HTML_ATTRS_ANY = {"class", "aria-hidden", "aria-label", "role", "lang", "dir"}
HTML_ATTRS_BY_TAG = {
    "th": {"colspan", "rowspan", "scope", "headers", "abbr"},
    "td": {"colspan", "rowspan", "headers"},
    "col": {"span", "width"},
    "colgroup": {"span"},
    "img": {"src", "alt", "width", "height"},
    "table": {"summary"},
}
# `class` values we keep: our own visually-hidden helper (the API uses it for
# screen-reader duplicates of table glyphs, e.g. "negative 0.9357").
HTML_CLASS_ALLOW = {"sr-only", "katex"}

SVG_ATTRS = {
    "id", "class", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
    "width", "height", "points", "transform", "style", "fill", "fill-rule",
    "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "stroke-miterlimit",
    "opacity", "font-family", "font-size", "font-weight", "font-style",
    "text-anchor", "dominant-baseline", "letter-spacing", "word-spacing",
    "viewbox", "preserveaspectratio", "clip-path", "clip-rule", "overflow",
    "gradientunits", "gradienttransform", "spreadmethod", "patternunits",
    "patterncontentunits", "patterntransform", "marker-start", "marker-mid",
    "marker-end", "markerwidth", "markerheight", "markerunits", "refx", "refy",
    "orient", "offset", "stop-color", "stop-opacity", "mask", "maskunits",
    "xlink:href", "href", "xmlns", "xmlns:xlink", "xml:space", "version",
    "aria-label", "role", "dx", "dy", "rotate", "textlength", "lengthadjust",
    "startoffset", "method", "spacing", "systemlanguage",
}

# Emit these with their canonical camelCase spelling.
SVG_ATTR_CANON = {
    "viewbox": "viewBox",
    "preserveaspectratio": "preserveAspectRatio",
    "gradientunits": "gradientUnits",
    "gradienttransform": "gradientTransform",
    "patternunits": "patternUnits",
    "patterncontentunits": "patternContentUnits",
    "patterntransform": "patternTransform",
    "markerwidth": "markerWidth",
    "markerheight": "markerHeight",
    "markerunits": "markerUnits",
    "maskunits": "maskUnits",
    "textlength": "textLength",
    "lengthadjust": "lengthAdjust",
    "clippath": "clipPath",
}

# Element names inside SVG whose canonical spelling is camelCase.
SVG_TAG_CANON = {
    "clippath": "clipPath",
    "lineargradient": "linearGradient",
    "radialgradient": "radialGradient",
    "textpath": "textPath",
}


def _clean_class(value: str) -> str | None:
    kept = [c for c in value.split() if c in HTML_CLASS_ALLOW]
    return " ".join(kept) or None


def _clean_style(value: str) -> str | None:
    """Inline style (SVG only): drop anything that could fetch or cover the page."""
    if CSS_UNSAFE_RE.search(value):
        return None
    for url in CSS_URL_RE.findall(value):
        # Only same-document references (#gradient, #glyph) survive.
        if not url.startswith("#"):
            value = value.replace(url, "")
    value = re.sub(r"(?:position|inset|z-index|top|right|bottom|left)\s*:[^;]*;?", "", value, flags=re.I)
    value = value.strip().strip(";").strip()
    return value or None


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.stack: list[tuple[str, bool]] = []  # (tag, inside_svg)
        self.svg_depth = 0
        self.drop_depth = 0

    def _attrs(self, attrs, in_svg: bool) -> str:
        parent = self.stack[-1][0] if self.stack else ""
        out: list[str] = []
        for raw_name, value in attrs:
            if value is None:
                continue
            name = raw_name.lower()
            if name.startswith("on"):
                continue
            if in_svg:
                if name not in SVG_ATTRS:
                    continue
                if name == "href" and not value.strip().startswith("#"):
                    continue  # matplotlib <use xlink:href="#glyph...">
                if name == "xlink:href" and not SAFE_URL_RE.match(value.strip()):
                    continue
                if name == "style":
                    value = _clean_style(value)
                    if value is None:
                        continue
                elif name == "class":
                    value = _clean_class(value)
                    if value is None:
                        continue
                elif BAD_URL_RE.search(value):
                    continue
                name = SVG_ATTR_CANON.get(name, name)
            else:
                if name not in HTML_ATTRS_ANY and name not in HTML_ATTRS_BY_TAG.get(parent, set()):
                    continue
                if BAD_URL_RE.match(value.strip()):
                    continue
                if name == "class":
                    value = _clean_class(value)
                    if value is None:
                        continue
                if name == "src" and not SAFE_URL_RE.match(value.strip()):
                    continue
            out.append(f'{name}="{html_mod.escape(value, quote=True)}"')
        return (" " + " ".join(out)) if out else ""

    def _emit(self, tag: str, attrs, self_closing: bool) -> None:
        in_svg = tag in ALLOWED_IN_SVG
        attrs_html = self._attrs(attrs, in_svg)
        if self_closing or tag in VOID:
            self.parts.append(f"<{tag}{attrs_html}/>" if self_closing else f"<{tag}{attrs_html}>")
            return
        self.parts.append(f"<{tag}{attrs_html}>")
        self.stack.append((tag, in_svg, True))
        if tag == "svg":
            self.svg_depth += 1

    # -- HTMLParser hooks -------------------------------------------------
    def handle_decl(self, decl: str) -> None:
        pass

    def handle_pi(self, data: str) -> None:
        pass

    def unknown_decl(self, data: str) -> None:
        pass

    def handle_comment(self, data: str) -> None:
        pass

    def handle_starttag(self, tag: str, attrs) -> None:
        if self.drop_depth:
            if tag.lower() in DROP_SUBTREE:
                self.drop_depth += 1
            return
        tag = tag.lower()
        if tag in DROP_SUBTREE:
            self.drop_depth = 1
            return
        in_svg = self.svg_depth > 0
        # `<svg>` may open an SVG subtree from HTML context; everything else has
        # to match the context it is already in.
        allowed = ALLOWED_IN_SVG if in_svg else (ALLOWED_OUTSIDE_SVG | {"svg"})
        if tag not in allowed:
            self.stack.append((tag, in_svg, False))  # unknown wrapper: keep its children
            return
        self._emit(SVG_TAG_CANON.get(tag, tag) if in_svg else tag, attrs, False)

    def handle_startendtag(self, tag: str, attrs) -> None:
        if self.drop_depth:
            return
        tag = tag.lower()
        if tag in DROP_SUBTREE:
            return
        in_svg = self.svg_depth > 0
        allowed = ALLOWED_IN_SVG if in_svg else (ALLOWED_OUTSIDE_SVG | {"svg"})
        if tag not in allowed:
            return
        self._emit(SVG_TAG_CANON.get(tag, tag) if in_svg else tag, attrs, True)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.drop_depth:
            if tag in DROP_SUBTREE:
                self.drop_depth -= 1
            return
        while self.stack:
            open_tag, was_svg, emitted = self.stack.pop()
            # Only close what we actually opened: dropped wrappers (and tags that
            # never matched an allowlist) must not leak stray end tags.
            if emitted:
                in_svg = open_tag in ALLOWED_IN_SVG
                name = SVG_TAG_CANON.get(open_tag, open_tag) if in_svg else open_tag
                self.parts.append(f"</{name}>")
            # SVG context is entered/left by <svg> alone — closing </g>, </path>
            # and friends must not end it early.
            if open_tag == "svg":
                self.svg_depth = max(0, self.svg_depth - 1)
            if open_tag == tag:
                break

    def handle_data(self, data: str) -> None:
        if self.drop_depth or not data:
            return
        self.parts.append(html_mod.escape(data, quote=False))


def _minify(markup: str) -> str:
    """Squeeze the inter-tag whitespace matplotlib indents with (safe subset)."""
    out = re.sub(r">\s+<", "><", markup)
    out = re.sub(r"[ \t]{2,}", " ", out)
    return out.strip()


def sanitize_rich(raw_html: str | None) -> str | None:
    """
    Return a safe HTML fragment for `raw_html`, or None when there is nothing
    worth storing (the plain-text columns already carry everything).
    """
    if not raw_html:
        return None
    cleaned = XML_NOISE_RE.sub("", raw_html)
    if not GRAPHIC_RE.search(cleaned):
        return None
    parser = _Sanitizer()
    parser.feed(cleaned)
    parser.close()
    markup = _minify("".join(parser.parts))
    if not markup or not GRAPHIC_RE.search(markup):
        return None
    return markup
