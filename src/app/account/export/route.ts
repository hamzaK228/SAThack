import { createClient } from "@/lib/supabase/server";
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const tables = [
    "profiles",
    "practice_attempts",
    "saved_questions",
    "test_sessions",
    "assessments",
    "diagnostics",
    "study_plans",
    "plan_tasks",
    "vocab_progress",
  ];
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
  };
  for (const table of tables) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const query = supabase
        .from(table)
        .select("*")
        .eq(table === "profiles" ? "id" : "user_id", user.id);
      const { data: batch, error } = await query
        .order("id")
        .range(from, from + 999);
      if (error) {
        console.error("[export]", { table, code: error.code });
        return new Response("Export failed. Please retry.", { status: 500 });
      }
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    data[table] = rows;
  }
  return Response.json(data, {
    headers: {
      "Content-Disposition": 'attachment; filename="sathack-account.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
