import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MathText from "@/components/MathText";
import { knowledgeForTopic } from "@/lib/ai/knowledge";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; skill?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { domain, skill } = await searchParams;
  const topic = skill || domain || "SAT";
  const chunks = knowledgeForTopic(domain ? [domain] : [], skill ? [skill] : [], 10);

  const practiceHref = `/dashboard/session${domain ? `?domain=${encodeURIComponent(domain)}` : ""}${skill ? `${domain ? "&" : "?"}skill=${encodeURIComponent(skill)}` : ""}`;

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Lesson</h1>
          <p className="dash-sub">📚 {topic} — from your SAT books.</p>
        </div>
      </div>

      <div className="dash-card">
        {chunks.length > 0 ? (
          <div className="lesson-body">
            {chunks.map((c, i) => (
              <div className="lesson-chunk" key={i}>
                <span className="lesson-source">
                  {c.book} · p.{c.page}
                </span>
                <MathText text={c.text} />
              </div>
            ))}
          </div>
        ) : (
          <div className="dash-empty">
            <p>No lesson content found for this topic yet.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Link className="btn btn-primary" href={practiceHref}>
          Practice this topic →
        </Link>
      </div>
    </div>
  );
}
