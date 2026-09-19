#!/usr/bin/env python3
"""Import scan-backed digital questions without rewriting equations or figures."""
import argparse
import concurrent.futures
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import difflib

import pymupdf as fitz
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage


def ocr(image, binary, psm=3, digits=False):
    with tempfile.NamedTemporaryFile(suffix=".png") as file:
        image.save(file.name)
        command = [binary, file.name, "stdout", "--psm", str(psm), "-l", "eng"]
        command += ["-c", "tessedit_char_whitelist=0123456789"] if digits else ["-c", "tessedit_create_tsv=1"]
        result = subprocess.run(command, capture_output=True, text=True, timeout=90, check=True)
    if digits:
        match = re.fullmatch(r"\s*(\d{1,2})\s*", result.stdout)
        return int(match[1]) if match else None
    return [row for row in csv.DictReader(io.StringIO(result.stdout), delimiter="\t")
            if row.get("level") == "5" and row.get("text", "").strip()]


def markers(image):
    gray = np.asarray(image.convert("L"))
    h, w = gray.shape
    labels, _ = ndimage.label(gray < 110)
    result = []
    for bounds in ndimage.find_objects(labels):
        if bounds is None:
            continue
        ys, xs = bounds
        bw, bh = xs.stop - xs.start, ys.stop - ys.start
        if not (0.012*w < bw < 0.065*w and 0.009*h < bh < 0.065*h):
            continue
        if not (ys.start > h*0.065 and ys.start < h*0.93):
            continue
        if (gray[ys, xs] < 110).mean() < 0.55:
            continue
        bar = gray[ys.start+bh//3:ys.stop-bh//4, xs.stop+2:min(w, xs.stop+int(w*0.15))]
        rect = gray[ys, xs] < 110
        inner = rect[2:-2,2:-2]
        edges = [inner[0].mean(),inner[-1].mean(),inner[:,0].mean(),inner[:,-1].mean()]
        square = .65 < bw/bh < 1.55 and min(edges) > .65
        column_edge = w*.035 < xs.start < w*.17 or w*.47 < xs.start < w*.60
        if (square and w*.035 < xs.start < w*.85) or (column_edge and bar.size and ((bar > 135) & (bar < 240)).mean() > 0.65):
            result.append((xs.start, ys.start, xs.stop, ys.stop))
    return sorted(result, key=lambda box: (box[0] > w/2, box[1]))


def lines_in(words, bounds):
    x0, y0, x1, y1 = bounds
    lines = {}
    for word in words:
        x, y = int(word["left"]), int(word["top"])
        if x0 <= x < x1 and y0 <= y < y1:
            key = (word["block_num"], word["par_num"], word["line_num"])
            lines.setdefault(key, []).append(word["text"])
    return [" ".join(line) for line in lines.values()]


def read_marker(image, binary, templates=None):
    templates = templates or {}
    digits = []
    for glyph in glyphs(image):
        distances = sorted((min(float(np.abs(glyph-np.asarray(example)).mean()) for example in examples), digit)
                           for digit, examples in templates.items())
        if len(distances) < 2 or distances[0][0] > .24 or distances[1][0]-distances[0][0] < .015:
            digits = []
            break
        digits.append(distances[0][1])
    if digits:
        return int("".join(digits))
    inverted = ImageOps.invert(image.convert("L"))
    inverted = ImageOps.expand(inverted.resize((inverted.width*6, inverted.height*6)), 20, 255)
    for psm in (7, 8, 10):
        value = ocr(inverted, binary, psm=psm, digits=True)
        if value is not None:
            return value
    return None


def glyphs(image):
    gray = np.asarray(image.convert("L"))[2:-2, 2:-2]
    mask = gray > 190
    active = np.flatnonzero(mask.any(axis=0))
    groups = np.split(active, np.where(np.diff(active)>1)[0]+1)
    result = []
    for group in groups:
        if len(group) < 2:
            continue
        part = mask[:, group[0]:group[-1]+1]
        rows = np.flatnonzero(part.any(axis=1))
        if not len(rows) or rows[-1]-rows[0] < mask.shape[0]*.30:
            continue
        part = part[rows[0]:rows[-1]+1]
        result.append(np.asarray(Image.fromarray(part.astype(np.uint8)*255).resize((24,40)))/255)
    return result


def convert(item):
    file, root, binary, force = item
    relative = file.relative_to(root).as_posix()
    test_id = hashlib.sha256(relative.encode()).hexdigest()[:24]
    output = root / ".digital" / test_id
    template_path = root / ".digital" / "digit-templates.json"
    templates = json.loads(template_path.read_text()) if template_path.exists() else {}
    output.mkdir(parents=True, exist_ok=True)
    manifest = output / "exam.json"
    if manifest.exists() and not force:
        saved = json.loads(manifest.read_text())
        return file.name, len(saved["questions"]), saved["issues"]
    doc = fitz.open(file)
    questions, modules, issues = [], [], []
    section, module_number = "reading_writing", 1
    current_module = None
    current_base = None
    previous_number = 0
    module_minutes = 32
    seen = {}
    for page_index, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(1500/page.rect.width, 1500/page.rect.width))
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        w, h = image.size
        image.save(output / f"page-{page_index}.webp", quality=88)
        native_words = page.get_text("words")
        if len(native_words) > 25:
            scale = 1500/page.rect.width
            words = [{"left": str(round(word[0]*scale)), "top": str(round(word[1]*scale)),
                      "width": str(round((word[2]-word[0])*scale)), "height": str(round((word[3]-word[1])*scale)),
                      "block_num": str(word[5]), "par_num": "0", "line_num": str(word[6]), "text": word[4]}
                     for word in native_words]
        else:
            words = ocr(image, binary)
        header = " ".join(lines_in(words, (0, 0, w, int(h*.23))))
        previous_section = section;
        if re.search(r"\bmath(?:ematics)?\b", header, re.I):
            section = "math"
        elif re.search(r"reading|writing|EBRW", header, re.I):
            section = "reading_writing"
        if section != previous_section:
            module_number, previous_number, current_module, current_base = 1, 0, None, None
        module_match = re.search(r"Module\s+(\d)", header, re.I)
        if module_match:
            module_number = int(module_match[1])
        duration = re.search(r"\b(\d{2})\s*(?:minutes|min\b)", header, re.I)
        if duration and 10 <= int(duration[1]) <= 90:
            module_minutes = int(duration[1])
        elif section != previous_section:
            module_minutes = 35 if section == "math" else 32
        boxes = markers(image)
        text = " ".join(word["text"] for word in words)
        photo = not boxes and re.search(r"Mark\s*for\s*[Rr]eview|Question\s+\d+\s+(?:of|0f)", text) is not None
        bare_numbers = {}
        if not boxes and not photo:
            for word in words:
                label = re.fullmatch(r"(\d{1,2})[.)]", word["text"])
                x, y = int(word["left"]), int(word["top"])
                if label and 0 < int(label[1]) <= 60 and y > h*.04 and (x < w*.20 or w*.47 < x < w*.60):
                    box = (x,y,x+int(word["width"]),y+int(word["height"]))
                    bare_numbers[box] = int(label[1])
            boxes = sorted(bare_numbers, key=lambda box:(box[0]>w/2,box[1]))
        if photo:
            match = re.search(r"Question\s+(\d+)\s+(?:of|0f)\s+(\d+)", text, re.I)
            if not match:
                match = re.search(r"\b(\d{1,2})\s+Mark\s*for\s*[Rr]eview", text)
            if not match:
                issues.append(f"Page {page_index+1}: screen question number needs review")
                continue
            boxes = [(0, 0, w, h)]
        for box_index, box in enumerate(boxes):
            x, y, xend, yend = box
            if photo:
                number = int(match[1])
                if "Math" in file.name:
                    section = "math"
                bounds = (0, 0, w, h)
            else:
                number = bare_numbers.get(box) if box in bare_numbers else read_marker(image.crop((x, y, xend, yend)), binary, templates)
                if number is None or not 1 <= number <= 60:
                    issues.append(f"Page {page_index+1}: unreadable question marker")
                    continue
                same_column = [b for b in boxes[box_index+1:] if (b[0] > w/2) == (x > w/2)]
                bottom = same_column[0][1] - 3 if same_column else int(h*.94)
                bounds = (max(0, x-4), y, int(w*.925) if x > w/2 else int(w*.50), bottom)
                if .65 < (xend-x)/(yend-y) < 1.55:
                    bounds = (int(w*.02), max(0,y-int(h*.025)), int(w*.98), bottom)
                if bare_numbers and all(b[0]<w*.20 for b in boxes):
                    bounds = (int(w*.02), max(0,y-4), int(w*.98), bottom)
            if number == 1 and previous_number > 1:
                module_number += 1 if not module_match else 0
                current_module, current_base = None, None
            module_id = f"{section}-{module_number}"
            if current_base != module_id:
                current_base = module_id
                # A source module can reset numbering without an explicit header.
                if any(m["id"] == module_id for m in modules):
                    module_id += f"-{len(modules)+1}"
                modules.append({"id": module_id, "section": section,
                                "label": f"{'Math' if section == 'math' else 'Reading & Writing'} - Module {module_number}",
                                "minutes": module_minutes, "questionIds": []})
                current_module = module_id
                previous_number = 0
            question_lines = lines_in(words, bounds)
            crop = image.crop(bounds)
            normalized = re.sub(r"\W+", "", " ".join(question_lines).lower())
            thumbnail = np.asarray(crop.convert("L").resize((32,64)), dtype=float)
            duplicate = seen.get((current_module, number))
            if duplicate:
                similarity = difflib.SequenceMatcher(None, normalized, duplicate[0]).ratio()
                if similarity > .94 and np.abs(thumbnail-duplicate[1]).mean() < 12:
                    continue
                if section == "reading_writing" and normalized == duplicate[0] and len(normalized) > 100:
                    continue
            if number != previous_number + 1:
                issues.append(f"Page {page_index+1}: expected question {previous_number+1}, found {number}")
            seen[(current_module, number)] = (normalized, thumbnail)
            option_labels = set()
            for line in question_lines:
                label = re.match(r"^([ABCD])(?:\s|[)._:])", line)
                if label:
                    option_labels.add(label[1])
            kind = "multiple_choice" if section == "reading_writing" or len(option_labels) >= 3 else "grid_in"
            if section == "math" and len(option_labels) in (1, 2):
                issues.append(f"Page {page_index+1}, question {number}: answer type needs review")
            question_id = f"q-{len(questions)}"
            crop.save(output / f"{question_id}.webp", quality=92)
            questions.append({"id": question_id, "number": number, "moduleId": current_module,
                              "page": page_index, "kind": kind, "ocrText": "\n".join(question_lines),
                              "answer": None})
            modules[-1]["questionIds"].append(question_id)
            previous_number = number
        if page_index % 10 == 0:
            print(f"[import] {file.name}: page {page_index+1}/{len(doc)}, {len(questions)} questions", flush=True)
    issues.append("Question completeness, module timing and answer formats require source verification.")
    if not questions:
        issues.append("No questions could be extracted from this source.")
    data = {"id": test_id, "title": file.stem, "pageCount": len(doc), "modules": modules,
            "questions": questions, "issues": issues, "source": relative, "version": 1}
    temporary = output / "exam.json.tmp"
    temporary.write_text(json.dumps(data, ensure_ascii=True))
    temporary.replace(manifest)
    return file.name, len(questions), issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("Practise tests"))
    parser.add_argument("--tesseract", default="tesseract")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--only")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    files = sorted(args.root.glob("*/*.pdf"))
    files = [file for file in files if "ANSW" not in file.name and (not args.only or args.only in file.name)]
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as executor:
        for name, count, issues in executor.map(convert, [(file, args.root, args.tesseract, args.force) for file in files]):
            print(f"[done] {name}: {count} questions, {len(issues)} review issues", flush=True)


if __name__ == "__main__":
    main()
