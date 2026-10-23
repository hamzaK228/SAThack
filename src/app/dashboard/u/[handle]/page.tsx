import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { levelFor } from "@/lib/gamification";
import FriendButton from "@/components/dashboard/FriendButton";

export const dynamic = "force-dynamic";

type ProfileRow = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  xp: number;
  questions: number;
  accuracy: number;
  streak: number;
  friendship_id: string | null;
  friendship_status: string | null;
  friendship_incoming: boolean;
};

/**
 * A student's profile: only what we agreed to show — level, XP, how many questions
 * they have practised, accuracy and their streak — plus the friend control. The
 * numbers come from the same leaderboard function the leaderboard itself uses, so
 * the two can never disagree.
 */
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("public_profile", { handle: decodeURIComponent(handle) });
  const profile = ((data ?? []) as ProfileRow[])[0];
  if (!profile) notFound();

  const xp = Number(profile.xp) || 0;
  const level = levelFor(xp);
  const isMe = profile.user_id === user.id;
  const handleText = profile.username?.trim() || "student";
  const name = profile.full_name?.trim() || `@${handleText}`;

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div className="profile-title">
          <span className="profile-avatar" aria-hidden="true">
            {handleText.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="dash-title">{name}</h1>
            <p className="dash-sub">
              @{handleText}
              {isMe ? " · this is you" : ""}
            </p>
          </div>
        </div>
        <div className="profile-actions">
          <a
            className="btn btn-ghost"
            href={`/api/share/${encodeURIComponent(handleText)}`}
            target="_blank"
            rel="noreferrer"
          >
            Share card
          </a>
          <Link className="btn btn-ghost" href="/dashboard/community">
            <ArrowLeft size={17} /> Community
          </Link>
        </div>
      </div>

      <div className="dash-stat-grid">
        <div className="dash-stat-card">
          <span className="dash-stat-label">Level</span>
          <span className="dash-stat-value accent">
            {level.level} · {level.title}
          </span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">XP</span>
          <span className="dash-stat-value">{xp.toLocaleString()}</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">Questions practised</span>
          <span className="dash-stat-value">{Number(profile.questions).toLocaleString()}</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">Accuracy</span>
          <span className="dash-stat-value accent">{profile.accuracy}%</span>
        </div>
        <div className="dash-stat-card">
          <span className="dash-stat-label">Active days</span>
          <span className="dash-stat-value">🔥 {profile.streak}</span>
        </div>
      </div>

      {!isMe && (
        <FriendButton
          handle={handleText}
          friendshipId={profile.friendship_id}
          status={profile.friendship_status}
          incoming={profile.friendship_incoming}
        />
      )}
    </div>
  );
}
