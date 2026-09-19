import { cache } from "react";
import { createClient } from "./supabase/server";
import { levelFor, streakFrom, xpFor } from "./gamification";

export const getProgressSummary=cache(async()=>{
  const db=await createClient();
  const {data,error}=await db.rpc("progress_summary");
  if(error)throw new Error("Could not load your progress.");
  const summary=data as {attempts:number;correct:number;tests:number;vocabReviews:number;days:Record<string,number>;recent:{domain:string;is_correct:boolean;created_at:string}[]};
  const streak=streakFrom(Object.keys(summary.days));
  const xp=xpFor({...summary,activeDays:streak.activeDays});
  return {...summary,...streak,xp,level:levelFor(xp),accuracy:summary.attempts ? Math.round(summary.correct/summary.attempts*100) : 0};
});
