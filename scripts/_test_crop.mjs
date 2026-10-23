import fs from "node:fs";
import sharp from "sharp";

const ROOT = "/home/hhh/Desktop/SAThack/SAThack";
const env = Object.fromEntries(
  fs.readFileSync(`${ROOT}/.env.local`, "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);

const cases = [
  { img: "/tmp/figtest/decv1_p77.jpg", out: "/tmp/figtest/crop_p77.jpg", what: "the graph/figure showing a line segment in the xy-plane (the geometry figure for the question)" },
  { img: "/tmp/figtest/decv1_p13.jpg", out: "/tmp/figtest/crop_p13.jpg", what: "the data table about percent change in average global market prices by commodity" },
  { img: "/tmp/figtest/decv1_p88.jpg", out: "/tmp/figtest/crop_p88.jpg", what: "the four small answer-choice tables labeled A, B, C, D" },
  { img: "/tmp/figtest/decv1_p38.jpg", out: "/tmp/figtest/crop_p38.jpg", what: "the data table about bird average mass and flight capability" },
];

async function bbox(imgPath, what) {
  const b64 = fs.readFileSync(imgPath).toString("base64");
  const res = await fetch(`${env.SAT_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SAT_AI_MODEL, temperature: 0, max_tokens: 300,
      ...(env.SAT_AI_MODEL.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: "text", text: `Locate ${what} in this exam page image. Return ONLY JSON {"top":number,"left":number,"width":number,"height":number} where each number is a PERCENTAGE of the image dimensions (0-100) for the tight bounding box around that element. Be precise.` },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  const j = await res.json();
  let out = JSON.parse((j.choices[0].message.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  // model sometimes nests the object in "answer"
  if (out && typeof out.answer === "string") out = JSON.parse(out.answer);
  if (out && out.answer && typeof out.answer === "object") out = out.answer;
  // model sometimes returns per-label boxes {A:{...},B:{...}} -> union
  const labels = ["A","B","C","D"];
  if (out && labels.every((k) => out[k] && typeof out[k].top === "number")) {
    const l = Math.min(...labels.map((k) => out[k].left));
    const t = Math.min(...labels.map((k) => out[k].top));
    const r = Math.max(...labels.map((k) => out[k].left + out[k].width));
    const b = Math.max(...labels.map((k) => out[k].top + out[k].height));
    out = { top: t, left: l, width: r - l, height: b - t };
  }
  return out;
}

for (const c of cases) {
  try {
    const b = await bbox(c.img, c.what);
    console.log(c.img, "bbox%", JSON.stringify(b));
    if (typeof b.top === "number" && typeof b.left === "number" && typeof b.width === "number" && typeof b.height === "number" && b.width > 2 && b.height > 2 && b.width < 100 && b.height < 100) {
      const meta = await sharp(c.img).metadata();
      const pad = Math.round(meta.width * 0.02);
      const l = Math.max(0, Math.round(meta.width * b.left / 100) - pad);
      const t = Math.max(0, Math.round(meta.height * b.top / 100) - pad);
      const w = Math.min(meta.width - l, Math.round(meta.width * b.width / 100) + 2 * pad);
      const h = Math.min(meta.height - t, Math.round(meta.height * b.height / 100) + 2 * pad);
      await sharp(c.img).extract({ left: l, top: t, width: w, height: h }).jpeg({ quality: 88 }).toFile(c.out);
      console.log("cropped ->", c.out, w + "x" + h);
    } else console.log("BAD BBOX", JSON.stringify(b));
  } catch (e) { console.log("ERR", c.img, e.message); }
}
