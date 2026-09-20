import CommunityHub, {
  type CommunityComment,
  type CommunityGroup,
  type CommunityPost,
  type CommunityReaction,
} from "@/components/dashboard/CommunityHub";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const groupSlug = (await searchParams).group;
  const [{ data: groups, error: groupsError }, { data: memberships }, { data: profile }] = await Promise.all([
    supabase.from("community_groups").select("id,slug,name,description,owner_id,owner_name,member_count,created_at").order("member_count", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("community_group_members").select("group_id,role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (groupsError) throw new Error("Could not load the community.");
  const typedGroups = (groups ?? []) as CommunityGroup[];
  const selectedGroup = typedGroups.find((group) => group.slug === groupSlug) ?? null;
  let postQuery = supabase
    .from("community_posts")
    .select("id,author_id,author_name,group_id,kind,title,body,created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  postQuery = selectedGroup ? postQuery.eq("group_id", selectedGroup.id) : postQuery.is("group_id", null);
  const { data: posts, error: postsError } = await postQuery;
  if (postsError) throw new Error("Could not load community posts.");
  const typedPosts = (posts ?? []) as CommunityPost[];
  const postIds = typedPosts.map((post) => post.id);
  const [{ data: comments }, { data: reactions }] = postIds.length
    ? await Promise.all([
        supabase.from("community_comments").select("id,post_id,author_id,author_name,body,created_at").in("post_id", postIds).order("created_at"),
        supabase.from("community_reactions").select("post_id,user_id").in("post_id", postIds),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <div className="dash-page community-page">
      <CommunityHub
        userId={user.id}
        userName={profile?.full_name?.trim() || "SAT Student"}
        groups={typedGroups}
        memberships={(memberships ?? []).map((item) => ({ groupId: item.group_id, role: item.role }))}
        selectedGroup={selectedGroup}
        posts={typedPosts}
        comments={(comments ?? []) as CommunityComment[]}
        reactions={(reactions ?? []) as CommunityReaction[]}
      />
    </div>
  );
}
