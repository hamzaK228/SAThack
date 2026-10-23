"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, Check, X } from "lucide-react";
import { requestFriend, respondFriendRequest, removeFriend } from "@/app/dashboard/community/friends";

export type FriendRow = {
  id: string;
  other_id: string;
  other_username: string | null;
  other_name: string | null;
  status: string;
  incoming: boolean;
  created_at: string;
};

const handleOf = (row: FriendRow) => row.other_username?.trim() || "student";

export default function FriendsPanel({ friends }: { friends: FriendRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const incoming = friends.filter((f) => f.status === "pending" && f.incoming);
  const sent = friends.filter((f) => f.status === "pending" && !f.incoming);
  const accepted = friends.filter((f) => f.status === "accepted");

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setNote(null);
    startTransition(async () => {
      const res = await work();
      setNote(res.ok ? done : res.error ?? "Something went wrong.");
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className="friends-panel" aria-label="Friends">
      <header className="friends-head">
        <h2 className="dash-section-title">Friends</h2>
        <span className="friends-count">
          {accepted.length} {accepted.length === 1 ? "friend" : "friends"}
          {incoming.length > 0 ? ` · ${incoming.length} waiting for you` : ""}
        </span>
      </header>

      <form
        className="friends-add"
        onSubmit={(event) => {
          event.preventDefault();
          const wanted = handle;
          if (!wanted.trim()) return;
          run(() => requestFriend(wanted), `Request sent to @${wanted.replace(/^@/, "").toLowerCase()}`);
          setHandle("");
        }}
      >
        <label className="sr-only" htmlFor="friends-handle">
          Add a friend by handle
        </label>
        <input
          id="friends-handle"
          className="field-input"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="Add a friend by their @handle"
          autoComplete="off"
          maxLength={24}
        />
        <button className="btn btn-primary" type="submit" disabled={pending || !handle.trim()}>
          <UserPlus size={16} /> Send request
        </button>
      </form>

      {note && (
        <p className="friends-note" role="status">
          {note}
        </p>
      )}

      {incoming.length > 0 && (
        <div className="friends-block">
          <span className="friends-label">Requests for you</span>
          {incoming.map((row) => (
            <div className="friend-row" key={row.id}>
              <span className="friend-avatar">{handleOf(row).slice(0, 1).toUpperCase()}</span>
              <Link className="friend-id" href={`/dashboard/u/${handleOf(row)}`}>
                <strong>@{handleOf(row)}</strong>
                <small>{row.other_name || "Student"}</small>
              </Link>
              <span className="friend-actions">
                <button
                  className="btn btn-know"
                  disabled={pending}
                  onClick={() => run(() => respondFriendRequest(row.id, true), `You and @${handleOf(row)} are friends now.`)}
                >
                  <Check size={15} /> Accept
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={() => run(() => respondFriendRequest(row.id, false), "Request declined.")}
                >
                  <X size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="friends-block">
        <span className="friends-label">Your friends</span>
        {accepted.length === 0 ? (
          <p className="friends-empty">
            No friends yet — send a request above, or find someone in the community search.
          </p>
        ) : (
          accepted.map((row) => (
            <div className="friend-row" key={row.id}>
              <span className="friend-avatar">{handleOf(row).slice(0, 1).toUpperCase()}</span>
              <Link className="friend-id" href={`/dashboard/u/${handleOf(row)}`}>
                <strong>@{handleOf(row)}</strong>
                <small>{row.other_name || "Student"}</small>
              </Link>
              <span className="friend-actions">
                <Link className="btn btn-ghost" href={`/dashboard/u/${handleOf(row)}`}>
                  Profile
                </Link>
                <button
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={() => run(() => removeFriend(row.id), `Removed @${handleOf(row)}.`)}
                >
                  <X size={15} />
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {sent.length > 0 && (
        <div className="friends-block">
          <span className="friends-label">Waiting for an answer</span>
          {sent.map((row) => (
            <div className="friend-row" key={row.id}>
              <span className="friend-avatar pending">{handleOf(row).slice(0, 1).toUpperCase()}</span>
              <Link className="friend-id" href={`/dashboard/u/${handleOf(row)}`}>
                <strong>@{handleOf(row)}</strong>
                <small>Invitation sent</small>
              </Link>
              <span className="friend-actions">
                <button
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={() => run(() => removeFriend(row.id), "Invitation withdrawn.")}
                >
                  Cancel
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
