import { createClient } from "@/lib/supabase/server";
import DuelGame from "@/components/dashboard/DuelGame";
import type { DuelState } from "./actions";

export const dynamic = "force-dynamic";

type DuelProfile = { rating: number; wins: number; losses: number; games: number; active_match_id: string | null };

export default async function DuelPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const supabase = await createClient();
  const room = (await searchParams).room?.toUpperCase() ?? "";
  const { data } = await supabase.rpc("duel_profile");
  const profile = ((Array.isArray(data) ? data[0] : data) ?? {
    rating: 1000,
    wins: 0,
    losses: 0,
    games: 0,
    active_match_id: null,
  }) as DuelProfile;

  let initialState: DuelState | null = null;
  if (profile.active_match_id) {
    const { data: state } = await supabase.rpc("duel_get_state", { match_uuid: profile.active_match_id });
    initialState = (state as DuelState | null) ?? null;
  }

  return (
    <DuelGame
      profile={profile}
      initialState={initialState}
      initialRoomCode={/^[A-Z2-9]{6}$/.test(room) ? room : ""}
    />
  );
}
