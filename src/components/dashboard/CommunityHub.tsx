"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Flag,
  Globe2,
  Heart,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDialog } from "@/lib/use-dialog";
import {
  addCommunityComment,
  createCommunityGroup,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  reportCommunityPost,
  setCommunityMembership,
  searchCommunityUsers,
  toggleCommunityReaction,
  type CommunityUserResult,
} from "@/app/dashboard/community/actions";

export type CommunityGroup = {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner_id: string;
  owner_name: string;
  member_count: number;
  created_at: string;
};
export type CommunityPost = {
  id: string;
  author_id: string;
  author_name: string;
  group_id: string | null;
  kind: "discussion" | "question" | "resource";
  title: string;
  body: string;
  created_at: string;
};
export type CommunityComment = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};
export type CommunityReaction = { post_id: string; user_id: string };

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export default function CommunityHub({
  userId,
  userName,
  groups,
  memberships,
  selectedGroup,
  posts,
  comments,
  reactions,
}: {
  userId: string;
  userName: string;
  groups: CommunityGroup[];
  memberships: { groupId: string; role: string }[];
  selectedGroup: CommunityGroup | null;
  posts: CommunityPost[];
  comments: CommunityComment[];
  reactions: CommunityReaction[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const [notice, setNotice] = useState({ text: "", bad: false });
  const [studentResults, setStudentResults] = useState<CommunityUserResult[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [studentSearched, setStudentSearched] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupDialogRef = useDialog<HTMLFormElement>(groupDialog, () => setGroupDialog(false));
  const memberIds = useMemo(() => new Set(memberships.map((item) => item.groupId)), [memberships]);
  const canPost = !selectedGroup || memberIds.has(selectedGroup.id);
  const commentsByPost = useMemo(() => {
    const grouped = new Map<string, CommunityComment[]>();
    comments.forEach((comment) => grouped.set(comment.post_id, [...(grouped.get(comment.post_id) ?? []), comment]));
    return grouped;
  }, [comments]);
  const reactionsByPost = useMemo(() => {
    const grouped = new Map<string, CommunityReaction[]>();
    reactions.forEach((reaction) => grouped.set(reaction.post_id, [...(grouped.get(reaction.post_id) ?? []), reaction]));
    return grouped;
  }, [reactions]);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 250);
    };
    const channel = supabase
      .channel("community-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_reactions" }, refresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) {
    setNotice({ text: "", bad: false });
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice({ text: result.error ?? "Something went wrong.", bad: true });
      else {
        done?.();
        router.refresh();
      }
    });
  }

  function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () => createCommunityPost({
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
        kind: String(form.get("kind") ?? "discussion"),
        groupId: selectedGroup?.id ?? null,
      }),
      () => setComposerOpen(false),
    );
  }

  function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () => createCommunityGroup({ name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") }),
      () => setGroupDialog(false),
    );
  }

  async function findStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setNotice({ text: "", bad: false });
    const result = await searchCommunityUsers(studentSearch);
    setStudentResults(result.users);
    setStudentSearched(true);
    if (!result.ok) setNotice({ text: result.error ?? "Could not search students.", bad: true });
    setSearching(false);
  }

  return (
    <>
      <header className="community-head">
        <div>
          <p className="eyebrow">Student community</p>
          <h1 className="dash-title">{selectedGroup?.name ?? "International chat"}</h1>
          <p className="dash-sub">{selectedGroup?.description || "SAT questions, strategies, and progress from students everywhere."}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setComposerOpen((open) => !open)} disabled={!canPost}>
          <Plus size={17} /> New post
        </button>
      </header>

      <div className="community-tabs" role="navigation" aria-label="Community channels">
        <Link href="/dashboard/community" className={!selectedGroup ? "active" : ""}><Globe2 size={16} /> International</Link>
        {groups.filter((group) => memberIds.has(group.id)).slice(0, 4).map((group) => (
          <Link key={group.id} href={`/dashboard/community?group=${group.slug}`} className={selectedGroup?.id === group.id ? "active" : ""}>#{group.name}</Link>
        ))}
      </div>

      {notice.text && <p className={`feedback ${notice.bad ? "bad" : "ok"}`} role="status">{notice.text}</p>}
      {composerOpen && canPost && (
        <form className="community-composer" onSubmit={submitPost}>
          <div className="community-composer-top">
            <span className="community-avatar">{initials(userName)}</span>
            <input name="title" aria-label="Post title" placeholder="Discussion title" maxLength={120} required autoFocus />
            <select name="kind" aria-label="Post type" defaultValue="discussion">
              <option value="discussion">Discussion</option>
              <option value="question">Question</option>
              <option value="resource">Resource</option>
            </select>
          </div>
          <textarea name="body" aria-label="Post message" placeholder="Share with the community..." maxLength={3000} required />
          <div className="community-form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setComposerOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={pending}><Send size={16} /> Post</button>
          </div>
        </form>
      )}

      <div className="community-layout">
        <main className="community-feed" aria-label="Community posts">
          {!posts.length && (
            <div className="community-empty">
              <MessageCircle size={28} />
              <h2>Start the conversation</h2>
              <p>No posts here yet.</p>
            </div>
          )}
          {posts.map((post) => {
            const postComments = commentsByPost.get(post.id) ?? [];
            const postReactions = reactionsByPost.get(post.id) ?? [];
            const reacted = postReactions.some((reaction) => reaction.user_id === userId);
            return (
              <article className="community-post" key={post.id}>
                <header className="community-post-meta">
                  <span className="community-avatar">{initials(post.author_name)}</span>
                  <div><strong>@{post.author_name}</strong><span suppressHydrationWarning>{relativeTime(post.created_at)}</span></div>
                  <span className={`community-kind ${post.kind}`}>{post.kind}</span>
                </header>
                <h2>{post.title}</h2>
                <p className="community-post-body">{post.body}</p>
                <div className="community-post-actions">
                  <button className={reacted ? "active" : ""} aria-pressed={reacted} onClick={() => run(() => toggleCommunityReaction(post.id, reacted))} disabled={pending}>
                    <Heart size={17} fill={reacted ? "currentColor" : "none"} /> {postReactions.length}
                  </button>
                  <button onClick={() => setReplying(replying === post.id ? null : post.id)}><MessageCircle size={17} /> {postComments.length}</button>
                  {post.author_id === userId ? (
                    <button title="Delete post" aria-label="Delete post" onClick={() => run(() => deleteCommunityPost(post.id))}><Trash2 size={16} /></button>
                  ) : (
                    <button title="Report post" aria-label="Report post" onClick={() => run(() => reportCommunityPost(post.id), () => setNotice({ text: "Report sent.", bad: false }))}><Flag size={16} /></button>
                  )}
                </div>
                {(replying === post.id || postComments.length > 0) && (
                  <section className="community-replies" aria-label={`Replies to ${post.title}`}>
                    {postComments.map((comment) => (
                      <div className="community-reply" key={comment.id}>
                        <span className="community-avatar small">{initials(comment.author_name)}</span>
                        <div><p><strong>@{comment.author_name}</strong> <time suppressHydrationWarning>{relativeTime(comment.created_at)}</time></p><span>{comment.body}</span></div>
                        {comment.author_id === userId && <button aria-label="Delete reply" onClick={() => run(() => deleteCommunityComment(comment.id))}><Trash2 size={14} /></button>}
                      </div>
                    ))}
                    {replying === post.id && (
                      <form className="community-reply-form" onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const input = new FormData(form).get("reply");
                        run(() => addCommunityComment(post.id, String(input ?? "")), () => { form.reset(); setReplying(null); });
                      }}>
                        <input name="reply" aria-label="Write a reply" placeholder="Write a reply..." maxLength={1200} required autoFocus />
                        <button className="btn btn-primary" aria-label="Send reply" disabled={pending}><Send size={16} /></button>
                      </form>
                    )}
                  </section>
                )}
              </article>
            );
          })}
        </main>

        <aside className="community-groups" aria-label="Study groups">
          <form className="community-user-search" onSubmit={findStudents}>
            <label htmlFor="community-user-search">Find students</label>
            <div>
              <span aria-hidden="true">@</span>
              <input id="community-user-search" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); setStudentSearched(false); }} placeholder="username" minLength={2} maxLength={24} required />
              <button aria-label="Search students" title="Search students" disabled={searching}><Search size={17} /></button>
            </div>
            {studentSearched && !searching && (
              <div className="community-user-results" role="status">
                {studentResults.length ? studentResults.map((student) => (
                  <div key={student.id}><span className="community-avatar small">{initials(student.username)}</span><span><strong>@{student.username}</strong><small>{student.full_name}</small></span></div>
                )) : <small>No matching students.</small>}
              </div>
            )}
          </form>
          <div className="community-groups-head"><div><span>Study groups</span><small>{groups.length} active</small></div><button aria-label="Create group" title="Create group" onClick={() => setGroupDialog(true)}><Plus size={18} /></button></div>
          <div className="community-group-list">
            {groups.map((group) => {
              const joined = memberIds.has(group.id);
              const owner = memberships.find((item) => item.groupId === group.id)?.role === "owner";
              return (
                <div className="community-group" key={group.id}>
                  <Link href={`/dashboard/community?group=${group.slug}`}><span>#</span><div><strong>{group.name}</strong><small><Users size={13} /> {group.member_count}</small></div></Link>
                  {!owner && <button className={joined ? "joined" : ""} onClick={() => run(() => setCommunityMembership(group.id, !joined))} disabled={pending}>{joined ? "Joined" : "Join"}</button>}
                </div>
              );
            })}
          </div>
          <p className="community-rules"><strong>Community standard</strong> Be useful, protect personal information, and report unsafe content.</p>
        </aside>
      </div>

      {groupDialog && (
        <div className="community-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setGroupDialog(false)}>
          <form ref={groupDialogRef} tabIndex={-1} className="community-dialog" role="dialog" aria-modal="true" aria-labelledby="create-group-title" onSubmit={submitGroup}>
            <header><h2 id="create-group-title">Create a study group</h2><button type="button" aria-label="Close" onClick={() => setGroupDialog(false)}><X size={19} /></button></header>
            <label className="field"><span className="field-label">Group name</span><input className="field-input" name="name" maxLength={48} required autoFocus /></label>
            <label className="field"><span className="field-label">Description</span><textarea className="field-input" name="description" maxLength={240} rows={4} /></label>
            <div className="community-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setGroupDialog(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Create group</button></div>
          </form>
        </div>
      )}
    </>
  );
}
