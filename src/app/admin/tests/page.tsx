import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All practice tests | SAThack admin",
  robots: { index: false, follow: false },
};

export default async function AdminTestsPage() {
  const supabase = await createClient();
  const { data: forms } = await supabase
    .from("practice_forms")
    .select("id, title, published")
    .order("id");

  const forms_ = forms ?? [];
  // Each form's questions carry source_id `real:<formId>:m<module>:q<n>`.
  const counts = await Promise.all(
    forms_.map(async (form) => {
      const { count } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .like("source_id", `real:${form.id}:%`);
      return count ?? 0;
    }),
  );

  return (
    <div className="admin-console">
      <section className="admin-workspace" aria-labelledby="browse-title">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Content library</p>
          <h2 id="browse-title">All practice tests</h2>
          <p>Every form in the test library. Open one to read its questions and answer key.</p>
        </div>
        <Link href="/admin">← Overview</Link>
      </div>

      <p className="admin-browse-count">{forms_.length} forms</p>

      {forms_.length ? (
        <div className="admin-browse-list">
          {forms_.map((form, index) => (
            <article key={form.id}>
              <div className="browse-meta">
                <span className="chip">{form.id}</span>
                {form.published ? <span className="chip">published</span> : <span className="chip off">draft</span>}
                <span className="chip dim">{counts[index]} questions</span>
              </div>
              <p><Link href={`/admin/tests/${form.id}`}>{form.title}</Link></p>
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-empty">No practice forms yet.</p>
      )}
    </section>
    </div>
  );
}
