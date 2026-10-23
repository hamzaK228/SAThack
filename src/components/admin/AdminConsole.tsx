"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Activity,
  Ban,
  BookOpenCheck,
  Check,
  FileQuestion,
  Flag,
  ImagePlus,
  Library,
  MessageSquareText,
  ScanText,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import {
  addPracticeTest,
  addQuestion,
  addVocabWord,
  deleteAdminEntity,
  extractGlmOcrQuestion,
  generateVocabDraft,
  resolveCommunityReport,
  reviewVocabSuggestion,
  updateUserAccess,
  type AdminActionResult,
} from "@/app/admin/actions";
import { DOMAIN_ORDER } from "@/lib/plan";
import { createClient } from "@/lib/supabase/client";
import TestBuilder from "./TestBuilder";

type AdminUser = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  current_score: number | null;
  target_score: number | null;
  community_suspended_until: string | null;
};
type AdminReport = { id: string; post_id: string; reason: string; status: string; created_at: string; postTitle: string };
type AdminPost = { id: string; title: string; author_name: string; kind: string; created_at: string };
type AdminGroup = { id: string; name: string; owner_name: string; member_count: number; created_at: string };
type Suggestion = { id: string; word: string; definition: string; example_sentence: string; ai_assisted: boolean; created_at: string };
type AuditLog = { id: number; action: string; entity_type: string; entity_id: string | null; created_at: string };
type ContentItem = { id: string; label: string; meta: string };

export default function AdminConsole({
  stats,
  migrationReady,
  users,
  reports,
  posts,
  groups,
  suggestions,
  logs,
  questions,
  vocab,
  tests,
}: {
  stats: { label: string; value: number }[];
  migrationReady: boolean;
  users: AdminUser[];
  reports: AdminReport[];
  posts: AdminPost[];
  groups: AdminGroup[];
  suggestions: Suggestion[];
  logs: AuditLog[];
  questions: ContentItem[];
  vocab: ContentItem[];
  tests: ContentItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<AdminActionResult | null>(null);
  const [vocabDraft, setVocabDraft] = useState({ word: "", definition: "", example: "", tags: "" });
  const [questionText, setQuestionText] = useState("");

  function run(task: () => Promise<AdminActionResult>, reset?: () => void) {
    setNotice(null);
    startTransition(async () => {
      const result = await task();
      setNotice(result);
      if (result.ok) reset?.();
    });
  }

  function remove(entity: string, id: string, label: string) {
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    run(() => deleteAdminEntity(entity, id));
  }

  function changeAccess(user: AdminUser, operation: "promote" | "demote" | "suspend" | "restore") {
    if ((operation === "demote" || operation === "suspend") && !window.confirm(
      operation === "demote"
        ? `Remove admin access from @${user.username}?`
        : `Suspend @${user.username} from posting in Community for 7 days?`,
    )) return;
    run(() => updateUserAccess(user.id, operation));
  }

  async function uploadContentImage(file: File, folder: string) {
    const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!allowed.has(file.type)) return { error: "Images must be PNG, JPEG, WebP, or GIF." };
    if (file.size > 8 * 1024 * 1024) return { error: "Images must be smaller than 8 MB." };
    const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${folder}/${crypto.randomUUID()}-${filename}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("question-media").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return { error: `Image upload failed: ${error.message}` };
    const { data } = supabase.storage.from("question-media").getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  const statIcons = [FileQuestion, Library, BookOpenCheck, Users];

  return (
    <div className="admin-console">
      {!migrationReady && (
        <div className="admin-migration-warning" role="alert">
          <Activity size={19} />
          <div><strong>Database upgrade required</strong><p>Apply the latest Supabase migration before using approvals, logs, and write controls.</p></div>
        </div>
      )}
      {notice && <p className={`admin-notice ${notice.ok ? "ok" : "bad"}`} role="status">{notice.message}</p>}

      <section className="admin-overview" id="overview" aria-labelledby="overview-title">
        <div className="admin-section-heading"><div><p className="eyebrow">Live overview</p><h1 id="overview-title">Platform control center</h1></div><span><ShieldCheck size={16} /> Server verified</span></div>
        <div className="admin-stat-grid standalone">
          {stats.map((stat, index) => {
            const Icon = statIcons[index] ?? Activity;
            return <article className="admin-stat" key={stat.label}><span><Icon size={20} /></span><div><strong>{stat.value.toLocaleString()}</strong><p>{stat.label}</p></div></article>;
          })}
        </div>
      </section>

      <section className="admin-workspace" id="content" aria-labelledby="content-title">
        <div className="admin-section-heading"><div><p className="eyebrow">Content studio</p><h2 id="content-title">Create learning content</h2><p>Publish reviewed questions, vocabulary, and practice-test records.</p></div></div>
        <div className="admin-form-grid">
          <form className="admin-editor" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            run(async () => {
              const image = data.get("media_file");
              let mediaPath = "";
              if (image instanceof File && image.size > 0) {
                const uploaded = await uploadContentImage(image, "questions");
                if (uploaded.error || !uploaded.path || !uploaded.url) return { ok: false, message: uploaded.error ?? "Image upload failed." };
                mediaPath = uploaded.path;
                data.set("media_url", uploaded.url);
              }
              data.delete("media_file");
              data.delete("ocr_file");
              const result = await addQuestion(data);
              if (!result.ok && mediaPath) await createClient().storage.from("question-media").remove([mediaPath]);
              return result;
            }, () => { form.reset(); setQuestionText(""); });
          }}>
            <header><FileQuestion size={19} /><div><h3>Add question</h3><p>Four-choice SAT item</p></div></header>
            <div className="admin-form-row"><select name="section" defaultValue="reading_writing" aria-label="Section"><option value="reading_writing">Reading & Writing</option><option value="math">Math</option></select><select name="difficulty" defaultValue="medium" aria-label="Difficulty"><option>easy</option><option>medium</option><option>hard</option></select></div>
            <select name="domain" defaultValue={DOMAIN_ORDER[0]} aria-label="Domain">{DOMAIN_ORDER.map((domain) => <option key={domain}>{domain}</option>)}</select>
            <input name="skill" placeholder="Skill" maxLength={120} required />
            <textarea name="passage" placeholder="Passage or stimulus (optional)" rows={2} />
            <textarea name="question" value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="Question — use $...$ for math" rows={4} required />
            <div className="admin-media-tools">
              <label className="admin-file-field"><span><ScanText size={14} /> GLM-OCR screenshot to math</span><input name="ocr_file" type="file" accept="image/png,image/jpeg" /></label>
              <button className="admin-secondary" type="button" disabled={pending} onClick={(event) => {
                const form = event.currentTarget.form;
                const file = form ? new FormData(form).get("ocr_file") : null;
                const ocrData = new FormData();
                if (file instanceof File) ocrData.set("file", file);
                run(async () => {
                  const result = await extractGlmOcrQuestion(ocrData);
                  if (result.ok && result.data?.text) setQuestionText(result.data.text);
                  return result;
                });
              }}><Sparkles size={14} /> Extract with GLM-OCR</button>
            </div>
            <div className="admin-media-box">
              <span><ImagePlus size={15} /> Graph, table, or figure</span>
              <label className="admin-file-field"><span>Upload image</span><input name="media_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
              <input name="media_alt" placeholder="Image description (required when uploading)" maxLength={300} />
              <input name="media_caption" placeholder="Caption (optional)" maxLength={500} />
              <select name="media_placement" defaultValue="question" aria-label="Image placement"><option value="question">Show with question</option><option value="passage">Show with passage / stimulus</option></select>
            </div>
            <div className="admin-choice-grid">{["A", "B", "C", "D"].map((label) => <label key={label}><span>{label}</span><input name={`choice_${label}`} placeholder={`Choice ${label}`} required /></label>)}</div>
            <div className="admin-form-row"><select name="correct" defaultValue="A" aria-label="Correct answer">{["A", "B", "C", "D"].map((label) => <option key={label}>{label}</option>)}</select><input name="explanation" placeholder="Explanation" required /></div>
            <button className="admin-primary" disabled={pending}>Publish question</button>
          </form>

          <form className="admin-editor" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            run(() => addVocabWord(data), () => { form.reset(); setVocabDraft({ word: "", definition: "", example: "", tags: "" }); });
          }}>
            <header><Library size={19} /><div><h3>Add vocabulary</h3><p>Draft meaning with GLM</p></div></header>
            <div className="admin-ai-field"><input name="word" value={vocabDraft.word} onChange={(event) => setVocabDraft((draft) => ({ ...draft, word: event.target.value }))} placeholder="Word" required /><button type="button" disabled={pending || vocabDraft.word.length < 2} onClick={() => run(async () => {
              const result = await generateVocabDraft(vocabDraft.word);
              if (result.ok && result.data) setVocabDraft((draft) => ({ ...draft, definition: result.data?.definition ?? "", example: result.data?.example ?? "", tags: result.data?.tags ?? "" }));
              return result;
            })}><Sparkles size={15} /> AI write</button></div>
            <textarea name="definition" value={vocabDraft.definition} onChange={(event) => setVocabDraft((draft) => ({ ...draft, definition: event.target.value }))} placeholder="Definition" rows={4} required />
            <textarea name="example" value={vocabDraft.example} onChange={(event) => setVocabDraft((draft) => ({ ...draft, example: event.target.value }))} placeholder="Example sentence" rows={3} />
            <input name="tags" value={vocabDraft.tags} onChange={(event) => setVocabDraft((draft) => ({ ...draft, tags: event.target.value }))} placeholder="Tags, comma separated" />
            <button className="admin-primary" disabled={pending}>Publish word</button>
          </form>

          <form className="admin-editor" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            run(async () => {
              const file = data.get("file");
              let uploadedPath = "";
              let uploadedMediaPath = "";
              if (file instanceof File && file.size > 0) {
                if (file.type !== "application/pdf") return { ok: false, message: "Practice tests must be PDF files." };
                const id = String(data.get("id") ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
                const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
                uploadedPath = `${id}/${filename}`;
                const supabase = createClient();
                const { error } = await supabase.storage.from("practice-tests").upload(uploadedPath, file, { contentType: "application/pdf", upsert: false });
                if (error) return { ok: false, message: `Upload failed: ${error.message}` };
                data.set("storage_path", uploadedPath);
                data.set("filename", filename);
                data.set("size", String(file.size));
              }
              const mediaFile = data.get("media_file");
              if (mediaFile instanceof File && mediaFile.size > 0) {
                const testId = String(data.get("id") ?? "test").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
                const uploaded = await uploadContentImage(mediaFile, `tests/${testId}`);
                if (uploaded.error || !uploaded.path || !uploaded.url) {
                  if (uploadedPath) await createClient().storage.from("practice-tests").remove([uploadedPath]);
                  return { ok: false, message: uploaded.error ?? "Test image upload failed." };
                }
                uploadedMediaPath = uploaded.path;
                data.set("media_path", uploaded.path);
                data.set("media_url", uploaded.url);
              }
              // The PDF already went directly to Supabase Storage. Do not send
              // it through the Server Action's request body as well.
              data.delete("file");
              data.delete("media_file");
              const result = await addPracticeTest(data);
              if (!result.ok && uploadedPath) await createClient().storage.from("practice-tests").remove([uploadedPath]);
              if (!result.ok && uploadedMediaPath) await createClient().storage.from("question-media").remove([uploadedMediaPath]);
              return result;
            }, () => form.reset());
          }}>
            <header><BookOpenCheck size={19} /><div><h3>Add practice test</h3><p>Register an uploaded PDF</p></div></header>
            <div className="admin-form-row"><input name="id" placeholder="test-id" required /><input name="year" placeholder="Year" required /></div>
            <input name="title" placeholder="Test title" required />
            <label className="admin-file-field"><span>Upload test PDF</span><input name="file" type="file" accept="application/pdf" /></label>
            <input name="storage_path" placeholder="Or existing storage path" />
            <label className="admin-file-field"><span>Optional cover, graph, or reference image</span><input name="media_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <div className="admin-checks"><label><input type="checkbox" name="published" /> Published</label><label><input type="checkbox" name="answer_key" /> Includes answer key</label></div>
            <button className="admin-primary" disabled={pending}>Add test</button>
          </form>
        </div>

        <TestBuilder />

        <div className="admin-inventory-grid">
          <Inventory title="Recent questions" items={questions} entity="question" pending={pending} remove={remove} browseHref="/admin/questions" />
          <Inventory title="Recent vocabulary" items={vocab} entity="vocab_word" pending={pending} remove={remove} browseHref="/admin/vocab" />
          <Inventory title="Practice tests" items={tests} entity="practice_test" pending={pending} remove={remove} browseHref="/admin/tests" />
        </div>
      </section>

      <section className="admin-workspace" id="community" aria-labelledby="community-admin-title">
        <div className="admin-section-heading"><div><p className="eyebrow">Trust & community</p><h2 id="community-admin-title">Moderation queue</h2><p>Review reports and remove unsafe posts or groups.</p></div><Link href="/dashboard/community">Open community</Link></div>
        <div className="admin-moderation-grid">
          <div className="admin-list-card"><header><Flag size={18} /><h3>Open reports</h3><span>{reports.length}</span></header>{reports.length ? reports.map((report) => <article key={report.id}><div><strong>{report.postTitle}</strong><p>{report.reason} · {new Date(report.created_at).toLocaleDateString()}</p></div><div><button onClick={() => run(() => resolveCommunityReport(report.id, "resolved"))} disabled={pending} aria-label="Resolve report"><Check size={15} /></button><button onClick={() => run(() => resolveCommunityReport(report.id, "dismissed"))} disabled={pending} aria-label="Dismiss report"><X size={15} /></button></div></article>) : <Empty text="No open reports." />}</div>
          <div className="admin-list-card"><header><MessageSquareText size={18} /><h3>Recent posts</h3><span>{posts.length}</span></header>{posts.map((post) => <article key={post.id}><div><strong>{post.title}</strong><p>@{post.author_name} · {post.kind}</p></div><button onClick={() => remove("community_post", post.id, post.title)} disabled={pending} aria-label={`Delete ${post.title}`}><Trash2 size={15} /></button></article>)}</div>
          <div className="admin-list-card"><header><Users size={18} /><h3>Study groups</h3><span>{groups.length}</span></header>{groups.map((group) => <article key={group.id}><div><strong>{group.name}</strong><p>@{group.owner_name} · {group.member_count} members</p></div><button onClick={() => remove("community_group", group.id, group.name)} disabled={pending} aria-label={`Delete ${group.name}`}><Trash2 size={15} /></button></article>)}</div>
        </div>
      </section>

      <section className="admin-workspace" id="vocab-review" aria-labelledby="vocab-review-title">
        <div className="admin-section-heading"><div><p className="eyebrow">Student contributions</p><h2 id="vocab-review-title">Vocabulary review</h2><p>Students may submit a word manually or ask AI to draft its meaning. Nothing is published until approval.</p></div></div>
        <div className="admin-review-list">{suggestions.length ? suggestions.map((item) => <article key={item.id}><div><strong>{item.word}</strong>{item.ai_assisted && <span><Sparkles size={12} /> AI assisted</span>}<p>{item.definition}</p><small>{item.example_sentence}</small></div><div><button className="approve" onClick={() => run(() => reviewVocabSuggestion(item.id, "approved"))} disabled={pending}><Check size={15} /> Approve</button><button onClick={() => run(() => reviewVocabSuggestion(item.id, "rejected"))} disabled={pending}><X size={15} /> Reject</button></div></article>) : <Empty text="No vocabulary submissions waiting." />}</div>
      </section>

      <section className="admin-workspace" id="users" aria-labelledby="users-title">
        <div className="admin-section-heading"><div><p className="eyebrow">Access</p><h2 id="users-title">Users</h2><p>Manage staff roles and temporary community restrictions.</p></div></div>
        <div className="admin-user-table" role="table" aria-label="Users">
          {users.map((user) => {
            const suspended = !!user.community_suspended_until && new Date(user.community_suspended_until) > new Date();
            return <article key={user.id} role="row"><span className="admin-user-avatar">{user.username.slice(0, 2).toUpperCase()}</span><div><strong>@{user.username}</strong><p>{user.full_name || "SAT student"}</p></div><span className={`admin-role ${user.role}`}>{user.role}</span><span>{user.current_score ?? "—"} → {user.target_score ?? "—"}</span><div className="admin-row-actions"><button onClick={() => changeAccess(user, user.role === "admin" ? "demote" : "promote")} disabled={pending} title={user.role === "admin" ? "Remove admin" : "Make admin"}><UserCog size={15} /></button><button className={suspended ? "active" : ""} onClick={() => changeAccess(user, suspended ? "restore" : "suspend")} disabled={pending} title={suspended ? "Restore community access" : "Suspend community for 7 days"}><Ban size={15} /></button></div></article>;
          })}
        </div>
      </section>

      <section className="admin-workspace" id="logs" aria-labelledby="logs-title">
        <div className="admin-section-heading"><div><p className="eyebrow">Accountability</p><h2 id="logs-title">Admin audit log</h2><p>Every privileged change records the actor, action, entity, and time.</p></div></div>
        <div className="admin-log-list">{logs.length ? logs.map((log) => <article key={log.id}><Activity size={15} /><strong>{log.action}</strong><span>{log.entity_type}{log.entity_id ? ` · ${log.entity_id.slice(0, 12)}` : ""}</span><time>{new Date(log.created_at).toLocaleString()}</time></article>) : <Empty text="No admin actions recorded yet." />}</div>
      </section>
    </div>
  );
}

function Inventory({ title, items, entity, pending, remove, browseHref }: { title: string; items: ContentItem[]; entity: string; pending: boolean; remove: (entity: string, id: string, label: string) => void; browseHref?: string }) {
  return <div className="admin-list-card"><header><h3>{title}</h3>{browseHref ? <Link href={browseHref}>View all →</Link> : null}<span>{items.length}</span></header>{items.length ? items.map((item) => <article key={item.id}><div><strong>{item.label}</strong><p>{item.meta}</p></div><button onClick={() => remove(entity, item.id, item.label)} disabled={pending} aria-label={`Delete ${item.label}`}><Trash2 size={15} /></button></article>) : <Empty text="Nothing here yet." />}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="admin-empty">{text}</p>;
}
