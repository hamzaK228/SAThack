"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check, X } from "lucide-react";
import { requestFriend, respondFriendRequest, removeFriend } from "@/app/dashboard/community/friends";

/**
 * The relationship control on someone's profile: invite, answer, or unfriend.
 * `status` comes from the public_profile RPC, which already reports which side of
 * a pending request the viewer is on.
 */
export default function FriendButton({
  handle,
  friendshipId,
  status,
  incoming,
}: {
  handle: string;
  friendshipId: string | null;
  status: string | null;
  incoming: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await work();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return (
    <div className="profile-actions">
      {!friendshipId && (
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => requestFriend(handle))}>
          <UserPlus size={16} /> Add friend
        </button>
      )}

      {friendshipId && status === "pending" && incoming && (
        <>
          <button
            className="btn btn-know"
            disabled={pending}
            onClick={() => run(() => respondFriendRequest(friendshipId, true))}
          >
            <Check size={16} /> Accept request
          </button>
          <button
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => run(() => respondFriendRequest(friendshipId, false))}
          >
            <X size={16} /> Decline
          </button>
        </>
      )}

      {friendshipId && status === "pending" && !incoming && (
        <button className="btn btn-ghost" disabled={pending} onClick={() => run(() => removeFriend(friendshipId))}>
          Request sent — cancel
        </button>
      )}

      {friendshipId && status === "accepted" && (
        <button className="btn btn-ghost" disabled={pending} onClick={() => run(() => removeFriend(friendshipId))}>
          Friends · remove
        </button>
      )}

      {error && (
        <p className="friends-note" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
