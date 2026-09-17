import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import TestExam, { type TestModule, type TestQuestion } from "@/components/dashboard/TestExam";

export const dynamic = "force-dynamic";

const COLS =
  "id, section, domain, skill, difficulty, is_grid_in, question_text, question_text_html, passage, passage_html, choices, correct_answer, explanation";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
function pseudoShuffle<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => hash(a.id) - hash(b.id));
}

type Difficulty = "easy" | "medium" | "hard";

async function pick(
  supabase: Awaited<ReturnType<typeof createClient>>,
  section: "math" | "reading_writing",
  count: number,
  difficulties: Difficulty[] | null,
  exclude: Set<string>
): Promise<TestQuestion[]> {
  let q = supabase
    .from("questions")
    .select(COLS)
    .eq("is_official", true)
    .eq("section", section)
    .order("id")
    .limit(count * 2 + exclude.size + 20);

  if (difficulties) q = q.in("difficulty", difficulties);

  const { data } = await q;
  return (data ?? [])
    .filter((x) => !exclude.has(x.id))
    .slice(0, count) as TestQuestion[];
}

export default async function TestPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  // Module 1 (fixed mix) — deterministic via ordered fetch + hash shuffle.
  const rw1 = pseudoShuffle(await pick(supabase, "reading_writing", 27, null, new Set()));
  const math1 = pseudoShuffle(await pick(supabase, "math", 22, null, new Set()));

  const rw1Ids = new Set(rw1.map((q) => q.id));
  const math1Ids = new Set(math1.map((q) => q.id));

  // Module 2 variants (adaptive): easy OR hard, chosen after Module 1.
  const rw2easy = pseudoShuffle(
    await pick(supabase, "reading_writing", 27, ["easy", "medium"], rw1Ids)
  );
  const rw2hard = pseudoShuffle(
    await pick(supabase, "reading_writing", 27, ["medium", "hard"], rw1Ids)
  );
  const math2easy = pseudoShuffle(await pick(supabase, "math", 22, ["easy", "medium"], math1Ids));
  const math2hard = pseudoShuffle(await pick(supabase, "math", 22, ["medium", "hard"], math1Ids));

  const m1: TestModule[] = [
    { id: "rw1", section: "reading_writing", label: "Reading & Writing · Module 1", minutes: 32, questions: rw1 },
    { id: "math1", section: "math", label: "Math · Module 1", minutes: 35, questions: math1 },
  ];

  const m2 = {
    rw: {
      easy: { id: "rw2", section: "reading_writing" as const, label: "Reading & Writing · Module 2", minutes: 32, questions: rw2easy },
      hard: { id: "rw2", section: "reading_writing" as const, label: "Reading & Writing · Module 2", minutes: 32, questions: rw2hard },
    },
    math: {
      easy: { id: "math2", section: "math" as const, label: "Math · Module 2", minutes: 35, questions: math2easy },
      hard: { id: "math2", section: "math" as const, label: "Math · Module 2", minutes: 35, questions: math2hard },
    },
  };

  // Resume support: latest in-progress session for this user.
  const { data: session } = await supabase
    .from("test_sessions")
    .select("id, modules")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="dash-page">
      <TestExam
        m1={m1}
        m2={m2}
        sessionId={session?.id ?? null}
        initialProgress={(session?.modules as never) ?? null}
      />
    </div>
  );
}



