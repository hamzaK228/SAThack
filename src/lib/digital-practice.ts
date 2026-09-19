import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPracticeTests } from "./practice-tests";

export type DigitalQuestion = { id: string; number: number; moduleId: string; page: number; kind: "multiple_choice" | "grid_in"; answer: string | null };
export type DigitalModule = { id: string; section: string; label: string; minutes: number; questionIds: string[] };
export type DigitalExam = { id: string; title: string; pageCount: number; modules: DigitalModule[]; questions: DigitalQuestion[]; issues: string[] };

export async function getDigitalExam(id: string): Promise<DigitalExam | null> {
  if (!(await getPracticeTests()).some((test) => test.id === id && !test.answerKey)) return null;
  try {
    const data = JSON.parse(await readFile(path.join(process.cwd(), "Practise tests", ".digital", id, "exam.json"), "utf8"));
    return { id: data.id, title: data.title, pageCount: data.pageCount, modules: data.modules,
      questions: data.questions.map(({ id, number, moduleId, page, kind, answer }: DigitalQuestion) => ({ id, number, moduleId, page, kind, answer })),
      issues: [...new Set<string>([...data.issues, "Question completeness, module timing and answer formats require source verification."])] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
