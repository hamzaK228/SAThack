import AdminConsole from "@/components/admin/AdminConsole";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin control center | SAThack",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const supabase = await createClient();
  const [
    questionCount,
    vocabCount,
    testCount,
    userCount,
    usersResult,
    reportsResult,
    postsResult,
    groupsResult,
    suggestionsResult,
    logsResult,
    questionsResult,
    vocabResult,
    testsResult,
    contentSetupResult,
  ] = await Promise.all([
    supabase.from("questions").select("id", { count: "exact", head: true }),
    supabase.from("vocab_words").select("id", { count: "exact", head: true }),
    supabase.from("practice_test_catalog").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id,username,full_name,role,current_score,target_score,community_suspended_until").order("created_at", { ascending: false }).limit(40),
    supabase.from("community_reports").select("id,post_id,reason,status,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(30),
    supabase.from("community_posts").select("id,title,author_name,kind,created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("community_groups").select("id,name,owner_name,member_count,created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("vocab_suggestions").select("id,word,definition,example_sentence,ai_assisted,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(30),
    supabase.from("admin_audit_logs").select("id,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("questions").select("id,question_text,domain,skill,difficulty").limit(8),
    supabase.from("vocab_words").select("id,word,definition,tags").order("word").limit(8),
    supabase.from("practice_test_catalog").select("id,title,year,published").order("year", { ascending: false }).limit(8),
    supabase.rpc("admin_content_setup_ready"),
  ]);

  const posts = postsResult.data ?? [];
  const postTitles = new Map(posts.map((post) => [post.id, post.title]));
  const reports = (reportsResult.data ?? []).map((report) => ({
    ...report,
    postTitle: postTitles.get(report.post_id) ?? `Post ${report.post_id.slice(0, 8)}`,
  }));

  return (
    <AdminConsole
      migrationReady={!logsResult.error && !contentSetupResult.error && contentSetupResult.data === true}
      stats={[
        { label: "Questions", value: questionCount.count ?? 0 },
        { label: "Vocabulary", value: vocabCount.count ?? 0 },
        { label: "Practice tests", value: testCount.count ?? 0 },
        { label: "Users", value: userCount.count ?? 0 },
      ]}
      users={usersResult.data ?? []}
      reports={reports}
      posts={posts}
      groups={groupsResult.data ?? []}
      suggestions={suggestionsResult.data ?? []}
      logs={logsResult.data ?? []}
      questions={(questionsResult.data ?? []).map((question) => ({ id: question.id, label: question.question_text, meta: `${question.domain} · ${question.skill} · ${question.difficulty}` }))}
      vocab={(vocabResult.data ?? []).map((word) => ({ id: word.id, label: word.word, meta: word.definition }))}
      tests={(testsResult.data ?? []).map((test) => ({ id: test.id, label: test.title, meta: `${test.year} · ${test.published ? "Published" : "Draft"}` }))}
    />
  );
}
