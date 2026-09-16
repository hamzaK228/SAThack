#!/usr/bin/env python3
"""Convert College Board "active" question math (spoken alt-text) to LaTeX."""

import re

NUM = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
    "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000",
    "million": "1000000",
}

FRAC_DEN = {
    "half": "2", "halves": "2", "third": "3", "thirds": "3",
    "fourth": "4", "fourths": "4", "fifth": "5", "fifths": "5",
    "sixth": "6", "sixths": "6", "seventh": "7", "sevenths": "7",
    "eighth": "8", "eighths": "8", "ninth": "9", "ninths": "9",
    "tenth": "10", "tenths": "10", "eleventh": "11", "elevenths": "11",
    "twelfth": "12", "twelfths": "12", "thirteenth": "13", "thirteenths": "13",
    "fourteenth": "14", "fourteenths": "14", "fifteenth": "15", "fifteenths": "15",
    "sixteenth": "16", "sixteenths": "16", "seventeenth": "17", "seventeenths": "17",
    "eighteenth": "18", "eighteenths": "18", "nineteenth": "19", "nineteenths": "19",
    "twentieth": "20", "twentieths": "20", "hundredth": "100", "hundredths": "100",
    "thousandth": "1000", "thousandths": "1000",
}

_ORD = {
    "first": "1", "second": "2", "third": "3", "fourth": "4", "fifth": "5",
    "sixth": "6", "seventh": "7", "eighth": "8", "ninth": "9", "tenth": "10",
}


def _frac_repl(match):
    num_word = match.group(1)
    den_word = match.group(2)
    num = NUM.get(num_word, num_word)
    den = FRAC_DEN.get(den_word, den_word)
    return f"{num}/{den}"


def alt_to_latex(text):
    if not text:
        return ""
    s = text.strip()

    # --- structural conversions (before token separators are removed) ---

    # "the fraction with numerator X and denominator Y end fraction"
    s = re.sub(
        r"the fraction with numerator\s+(.*?)\s+and denominator\s+(.*?)\s+end fraction",
        lambda m: r"\frac{" + m.group(1) + "}{" + m.group(2) + "}",
        s,
    )
    # "the fraction X over Y" and "X over Y"
    s = re.sub(
        r"the fraction\s+(.*?)\s+over\s+(\S+)",
        lambda m: r"\frac{" + m.group(1) + "}{" + m.group(2) + "}",
        s,
    )
    s = re.sub(r"(\S+)\s+over\s+(\S+)", lambda m: r"\frac{" + m.group(1) + "}{" + m.group(2) + "}", s)

    # word fractions: "three halves", "one fourth", "negative two thirds"
    s = re.sub(
        r"\b(negative\s+)?(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(halves|thirds|fourths|fifths|sixths|sevenths|eighths|ninths|tenths|elevenths|twelfths)\b",
        lambda m: ("-" if m.group(1) else "") + NUM[m.group(2)] + "/" + FRAC_DEN[m.group(3)],
        s,
    )
    s = re.sub(
        r"\b(negative\s+)?(one|a)\s+(half|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b",
        lambda m: ("-" if m.group(1) else "") + "1/" + FRAC_DEN[m.group(3)],
        s,
    )

    # exponents: "raised to the X power" / "to the X power"
    s = re.sub(r"raised to the\s+(.*?)\s+power", lambda m: "^{" + m.group(1) + "}", s)
    s = re.sub(r"to the\s+(.*?)\s+power", lambda m: "^{" + m.group(1) + "}", s)

    # subscripts: "X sub N" -> "X_N"
    s = re.sub(r"\b([a-zA-Z])\s+sub\s+([a-zA-Z0-9]+)", r"\1_{\2}", s)

    # square/cube roots: "the square root of X" / "the cube root of X"
    s = re.sub(r"the square root of\s+([^,]+)", lambda m: r"\sqrt{" + m.group(1).strip() + "}", s)
    s = re.sub(r"the cube root of\s+([^,]+)", lambda m: r"\sqrt[3]{" + m.group(1).strip() + "}", s)

    # trig / functions: "tangent of B" -> "\tan(B)"
    s = re.sub(r"\btangent of\s+([a-zA-Z])", lambda m: r"\tan(" + m.group(1) + ")", s)
    s = re.sub(r"\bsine of\s+([a-zA-Z])", lambda m: r"\sin(" + m.group(1) + ")", s)
    s = re.sub(r"\bcosine of\s+([a-zA-Z])", lambda m: r"\cos(" + m.group(1) + ")", s)

    # "f of x" / "f of 6" -> "f(x)"/"f(6)"
    s = re.sub(r"\b([a-zA-Z])\s+of\s+([a-zA-Z0-9])", r"\1(\2)", s)

    # "pi" -> "\pi"
    s = re.sub(r"\bpi\b", lambda m: r"\pi", s)

    # hyphenated fractions: "three-halves" -> "three halves" (handled above)
    s = re.sub(r"\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*-\s*(half|halves|third|thirds|fourth|fourths|fifth|fifths|sixth|sixths|seventh|sevenths|eighth|eighths|ninth|ninths|tenth|tenths)\b",
               lambda m: m.group(1) + " " + m.group(2), s)
    s = re.sub(
        r"\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(halves|thirds|fourths|fifths|sixths|sevenths|eighths|ninths|tenths|elevenths|twelfths)\b",
        lambda m: NUM[m.group(1)] + "/" + FRAC_DEN[m.group(2)],
        s,
    )
    s = re.sub(
        r"\b(negative\s+)?(one|a)\s+(half|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b",
        lambda m: ("-" if m.group(1) else "") + "1/" + FRAC_DEN[m.group(3)],
        s,
    )

    # parentheses
    s = s.replace("open parenthesis", "(").replace("close parenthesis", ")")

    # powers (word)
    s = s.replace(" squared", "^2").replace(" cubed", "^3")

    # decimal point marker
    s = s.replace(" point", ".")

    # operators / relations (literals)
    s = s.replace("is less than or equal to", "\\le")
    s = s.replace("is greater than or equal to", "\\ge")
    s = s.replace("is not equal to", "\\ne")
    s = s.replace("is less than", "<")
    s = s.replace("is greater than", ">")
    s = s.replace("is equal to", "=")
    s = s.replace("which is", "")
    s = s.replace("the negative of", "-")
    s = s.replace("end fraction", "")
    s = s.replace("end root", "")
    s = s.replace("dot dot dot", "\\ldots")
    s = s.replace("times", "\\times")
    s = s.replace("plus", "+")
    s = s.replace("minus", "-")
    s = s.replace("equals", "=")
    s = s.replace("negative ", "-")
    s = s.replace("percent", "\\%")
    s = s.replace("dollars", "\\$")
    s = s.replace("degrees", "^{\\circ}")

    # units (keep as text)
    s = re.sub(
        r"\b(centimeters?|meters?|inches?|feet|pounds?|miles?|units?|seconds?|minutes?|hours?|dollars?)\b",
        lambda m: "\\text{" + m.group(1) + "}",
        s,
    )

    # --- separator / comma handling (order matters) ---

    # remove literal thousands commas in numbers (e.g. "100,250")
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    # remove literal comma-space token separators (", ")
    s = re.sub(r",\s*", " ", s)
    # now convert the spoken word "comma" (coordinate separator) -> ","
    s = re.sub(r"\bcomma\b", ",", s)

    # number words -> digits (standalone, after fractions handled)
    s = re.sub(r"\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b", lambda m: NUM[m.group(1)], s)

    # collapse number followed by variable: "120 a" -> "120a"
    s = re.sub(r"(?<=\d)\s+(?=[a-zA-Z])", "", s)

    # join decimal digits: "0 . 3 5" -> "0.35"
    s = re.sub(r"\.\s*(\d(?:\s*\d)*)", lambda m: "." + m.group(1).replace(" ", ""), s)

    # cleanup spaces
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*([+\-=<>])\s*", r"\1", s)
    s = s.replace("\\le", " \\le ").replace("\\ge", " \\ge ").replace("\\times", " \\times ")
    s = re.sub(r"\s+", " ", s).strip()
    return s
