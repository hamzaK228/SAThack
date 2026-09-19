import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getDigitalExam } from "@/lib/digital-practice";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  if (!await getCurrentUser()) return new Response("Unauthorized", { status: 401 });
  const { id, asset } = await params;
  if (!/^(?:q-\d+|page-\d+)\.webp$/.test(asset)) return new Response("Not found", { status: 404 });
  const exam = await getDigitalExam(id);
  if (!exam) return new Response("Not found", { status: 404 });
  const valid = asset.startsWith("q-") ? exam.questions.some((question) => `${question.id}.webp` === asset)
    : Number(asset.slice(5, -5)) < exam.pageCount;
  if (!valid) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), "Practise tests", ".digital", id, asset));
    return new Response(data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response("Not found", { status: 404 });
    throw error;
  }
}
