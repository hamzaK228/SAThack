import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPracticeTests } from "./practice-tests";
import { createClient } from "./supabase/server";

export type DigitalQuestion = { id: string; number: number; moduleId: string; page: number; kind: "multiple_choice" | "grid_in"; answer: string | null };
export type DigitalModule = { id: string; section: string; label: string; minutes: number; questionIds: string[] };
export type DigitalExam = { id: string; title: string; pageCount: number; modules: DigitalModule[]; questions: DigitalQuestion[]; issues: string[] };

export async function getDigitalExam(id: string): Promise<DigitalExam | null> {
  const test = (await getPracticeTests()).find((test) => test.id === id && !test.answerKey);
  if (!test) return null;
  try {
    let data;
    if(test.remote) {
      const supabase = await createClient();
      const result = await supabase.from("practice_test_catalog").select("manifest").eq("id",id).single();
      if(result.error) throw new Error("Could not load test.");
      data=result.data.manifest;
      if(!data)return null;
    } else data = JSON.parse(await readFile(path.join(process.cwd(), "Practise tests", ".digital", id, "exam.json"), "utf8"));
    return { id: data.id, title: data.title, pageCount: data.pageCount, modules: data.modules,
      questions: data.questions.map(({ id, number, moduleId, page, kind, answer }: DigitalQuestion) => ({ id, number, moduleId, page, kind, answer })),
      issues: [...new Set<string>([...data.issues, "Question completeness, module timing and answer formats require source verification."])] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
