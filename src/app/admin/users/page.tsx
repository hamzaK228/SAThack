import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/admin";
import { updateUserAccess } from "@/app/admin/actions";
import { nowMs } from "@/lib/now";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users | SAThack admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;
const OPERATIONS = ["promote", "demote", "suspend", "restore"] as const;
type Operation = (typeof OPERATIONS)[number];

/**
 * The console only ever showed the first 40 accounts with no way to search, so a
 * specific student could not be found at all. This page pages through them and
 * searches by handle or name — the two fields an admin can actually read.
 */
async function changeAccess(form: FormData) {
  "use server";
  const id = String(form.get("id") ?? "");
  const op = String(form.get("op") ?? "");
  if (OPERATIONS.includes(op as Operation)) {
    await updateUserAccess(id, op as Operation);
  }
  const query = String(form.get("q") ?? "");
  const page = String(form.get("page") ?? "1");
  redirect(`/admin/users?q=${encodeURIComponent(query)}&page=${encodeURIComponent(page)}`);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  // Commas and parentheses would break the PostgREST `or` filter.
  const search = (q ?? "").replace(/[,()]/g, " ").trim();
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  if (!(await getIsAdmin())) redirect("/dashboard");
  const supabase = await createClient();

  let countQuery = supabase.from("profiles").select("id", { count: "exact", head: true });
  let listQuery = supabase
    .from("profiles")
    .select("id, username, full_name, role, current_score, target_score, community_suspended_until, created_at")
    .order("created_at", { ascending: false });
  if (search) {
    const pattern = `%${search}%`;
    countQuery = countQuery.or(`username.ilike.${pattern},full_name.ilike.${pattern}`);
    listQuery = listQuery.or(`username.ilike.${pattern},full_name.ilike.${pattern}`);
  }

  const [countResult, listResult] = await Promise.all([
    countQuery,
    listQuery.range((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE - 1),
  ]);
  const users = listResult.data ?? [];
  const total = countResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(target));
    return `/admin/users?${params.toString()}`;
  }

  return (
    <div className="admin-console">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">People</p>
          <h2>Users</h2>
          <p>Search by handle or name, then change access. Emails live in Supabase Auth, not here.</p>
        </div>
        <Link href="/admin">← Overview</Link>
      </div>

      <form className="admin-browse-bar" method="get" action="/admin/users">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search handle or name…"
          aria-label="Search users"
        />
        <button type="submit">Search</button>
      </form>

      <p className="admin-browse-count">
        {total.toLocaleString()} users · page {pageNumber} of {pageCount}
      </p>

      {users.length ? (
        <div className="admin-browse-list">
          {users.map((user) => {
            const suspended = user.community_suspended_until
              ? new Date(user.community_suspended_until).getTime() > nowMs()
              : false;
            return (
              <article key={user.id}>
                <div className="browse-meta">
                  <span className="chip">@{user.username?.trim() || "student"}</span>
                  {user.full_name?.trim() && <span className="chip dim">{user.full_name}</span>}
                  <span className={`chip${user.role === "admin" ? "" : " dim"}`}>{user.role ?? "student"}</span>
                  {suspended && <span className="chip off">suspended</span>}
                  <span className="chip dim">
                    {user.current_score ?? "—"} → {user.target_score ?? "—"}
                  </span>
                  {user.username?.trim() && (
                    <Link className="browse-edit" href={`/dashboard/u/${user.username.trim()}`}>
                      Profile →
                    </Link>
                  )}
                </div>
                <div className="admin-user-actions">
                  {(["promote", "demote", "suspend", "restore"] as Operation[]).map((op) => (
                    <form key={op} action={changeAccess}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="op" value={op} />
                      <input type="hidden" name="q" value={search} />
                      <input type="hidden" name="page" value={String(pageNumber)} />
                      <button type="submit" className={op === "suspend" || op === "demote" ? "danger" : ""}>
                        {op === "promote"
                          ? "Make admin"
                          : op === "demote"
                            ? "Remove admin"
                            : op === "suspend"
                              ? "Suspend 7 days"
                              : "Restore"}
                      </button>
                    </form>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="admin-empty">No users match this search.</p>
      )}

      {pageCount > 1 && (
        <nav className="admin-pager" aria-label="Pagination">
          <span aria-disabled={pageNumber <= 1}>
            <Link href={pageHref(pageNumber - 1)}>← Previous</Link>
          </span>
          <span>
            Page {pageNumber} / {pageCount}
          </span>
          <span aria-disabled={pageNumber >= pageCount}>
            <Link href={pageHref(pageNumber + 1)}>Next →</Link>
          </span>
        </nav>
      )}
    </div>
  );
}
