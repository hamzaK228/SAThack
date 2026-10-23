"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Crown, DoorOpen, Search, Shield, Swords, UserRoundPlus, WifiOff, X } from "lucide-react";
import QuestionText from "@/components/QuestionText";
import { createClient } from "@/lib/supabase/client";
import {
  cancelDuel,
  createPrivateDuel,
  findRankedDuel,
  getDuelState,
  joinPrivateDuel,
  submitDuelAnswer,
  type DuelMode,
  type DuelState,
  type DuelSubject,
} from "@/app/dashboard/duel/actions";
import { rematchDuel } from "@/app/dashboard/feature-actions";

type Profile = { rating: number; wins: number; losses: number; games: number; active_match_id: string | null };

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export default function DuelGame({ profile, initialState, initialRoomCode = "" }: { profile: Profile; initialState: DuelState | null; initialRoomCode?: string }) {
  const [mode, setMode] = useState<DuelMode>("rush");
  const [subject, setSubject] = useState<DuelSubject>("math");
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [state, setState] = useState<DuelState | null>(initialState);
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [pending, startTransition] = useTransition();
  const refreshBusy = useRef(false);

  const refresh = useCallback(async () => {
    if (!state?.id || refreshBusy.current) return;
    refreshBusy.current = true;
    try {
      const result = await getDuelState(state.id);
      if (result.ok) setState(result.data);
    } finally {
      refreshBusy.current = false;
    }
  }, [state?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!state?.id || state.status === "completed" || state.status === "cancelled") return;
    // Realtime pushes carry the live updates; polling is only the fallback,
    // so it backs right off once the channel is confirmed subscribed.
    const delay = realtimeLive ? 15000 : state.status === "waiting" ? 2000 : 4000;
    const timer = window.setInterval(() => void refresh(), delay);
    return () => window.clearInterval(timer);
  }, [state?.id, state?.status, refresh, realtimeLive]);

  useEffect(() => {
    if (!state?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`duel-watch-${state.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "duel_matches", filter: `id=eq.${state.id}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "duel_players", filter: `match_id=eq.${state.id}` }, () => void refresh())
      .subscribe((status) => setRealtimeLive(status === "SUBSCRIBED"));
    return () => { setRealtimeLive(false); void supabase.removeChannel(channel); };
  }, [state?.id, refresh]);

  const secondsLeft = state?.endsAt ? Math.max(0, Math.ceil((new Date(state.endsAt).getTime() - now) / 1000)) : 0;
  const reconnectLeft = state?.disconnectDeadline ? Math.max(0, Math.ceil((new Date(state.disconnectDeadline).getTime() - now) / 1000)) : 30;

  function run(task: () => Promise<{ ok: boolean; data?: DuelState; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok && result.data) setState(result.data);
      else if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  async function answer() {
    if (!state || !selected.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await submitDuelAnswer(state.id, selected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice({ kind: result.data.correct ? "good" : "bad", text: result.data.correct ? "+1 Correct" : "Missed — next question" });
      setSelected("");
      setState(result.data.state);
      window.setTimeout(() => setNotice(null), 900);
    });
  }

  async function leaveWaiting() {
    if (!state) return;
    const result = await cancelDuel(state.id);
    if (result.ok) {
      setState(null);
      setError(null);
    } else setError(result.error);
  }

  if (!state || state.status === "cancelled") {
    const winRate = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
    return (
      <div className="dash-page duel-page">
        <header className="duel-hero">
          <div>
            <span className="duel-kicker"><Swords size={14} /> Live SAT competition</span>
            <h1>Choose your duel</h1>
            <p>Same questions. Same clock. Your answers decide the match.</p>
          </div>
          <div className="duel-rating-card" aria-label={`${profile.rating} duel rating`}>
            <span>DUEL RATING</span>
            <strong>{profile.rating}</strong>
            <small>{profile.games ? `${profile.wins}W · ${profile.losses}L · ${winRate}% win rate` : "Your first match starts at 1,000"}</small>
          </div>
        </header>

        <section className="duel-config" aria-label="Duel settings">
          <div className="duel-setting-block">
            <span className="duel-setting-label">1. Pick a mode</span>
            <div className="duel-mode-grid">
              <button className={`duel-mode-card${mode === "quick" ? " active" : ""}`} onClick={() => setMode("quick")}>
                <span className="duel-mode-icon">⚡</span>
                <span><strong>Quick Duel</strong><small>3 minutes · first correct answer wins</small></span>
                <i>{mode === "quick" && <Check size={16} />}</i>
              </button>
              <button className={`duel-mode-card${mode === "rush" ? " active" : ""}`} onClick={() => setMode("rush")}>
                <span className="duel-mode-icon">🔥</span>
                <span><strong>Question Rush</strong><small>5 minutes · most correct answers wins</small></span>
                <i>{mode === "rush" && <Check size={16} />}</i>
              </button>
            </div>
          </div>

          <div className="duel-setting-block">
            <span className="duel-setting-label">2. Choose a subject</span>
            <div className="duel-subject-tabs">
              <button className={subject === "math" ? "active" : ""} onClick={() => setSubject("math")}>Math</button>
              <button className={subject === "reading_writing" ? "active" : ""} onClick={() => setSubject("reading_writing")}>Reading &amp; Writing</button>
            </div>
            <p className="duel-balanced"><Shield size={14} /> Easy, medium, and hard questions are mixed evenly.</p>
          </div>
        </section>

        <section className="duel-entry-grid">
          <article className="duel-entry-card ranked">
            <div className="duel-entry-icon"><Search size={24} /></div>
            <span className="duel-pill">RANKED</span>
            <h2>Find an opponent</h2>
            <p>We&apos;ll match you with a player near your rating.</p>
            <button className="duel-primary" disabled={pending} onClick={() => run(() => findRankedDuel(mode, subject))}>
              {pending ? "Searching…" : "Start matchmaking"}
            </button>
            <small>Win +20 · Loss −15</small>
          </article>

          <article className="duel-entry-card">
            <div className="duel-entry-icon"><UserRoundPlus size={24} /></div>
            <span className="duel-pill neutral">UNRANKED</span>
            <h2>Challenge a friend</h2>
            <p>Create a private room and share its code.</p>
            <button className="duel-secondary" disabled={pending} onClick={() => run(() => createPrivateDuel(mode, subject))}>Create room</button>
            <small>Friend matches never change rating</small>
          </article>

          <article className="duel-entry-card join">
            <div className="duel-entry-icon"><DoorOpen size={24} /></div>
            <span className="duel-pill neutral">ROOM CODE</span>
            <h2>Join a room</h2>
            <p>Enter the code your friend sent you.</p>
            <div className="duel-code-form">
              <input value={roomCode} maxLength={6} placeholder="ABC234" aria-label="Room code" onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} />
              <button disabled={pending || roomCode.length !== 6} onClick={() => run(() => joinPrivateDuel(roomCode))}>Join</button>
            </div>
            <small>Six letters or numbers</small>
          </article>
        </section>
        {error && <p className="duel-error" role="alert">{error}</p>}
      </div>
    );
  }

  if (state.status === "waiting") {
    return (
      <div className="dash-page duel-page duel-wait-page">
        <div className="duel-wait-orbit" aria-hidden="true"><span /><span /><Swords size={34} /></div>
        <span className="duel-kicker">{state.matchType === "ranked" ? "RANKED MATCH" : "PRIVATE ROOM"}</span>
        <h1>{state.matchType === "ranked" ? "Finding your match…" : "Waiting for your friend"}</h1>
        <p>{state.matchType === "ranked" ? "Searching near your rating. The range widens every 20 seconds." : "Share this room code. The duel starts when your friend joins."}</p>
        {state.roomCode && (
          <button className="duel-room-code" onClick={() => void navigator.clipboard.writeText(state.roomCode ?? "")}>
            <span>{state.roomCode}</span><Copy size={18} />
          </button>
        )}
        {state.roomCode && (
          <button
            className="duel-cancel"
            onClick={() =>
              void navigator.clipboard.writeText(
                `${window.location.origin}/dashboard/duel?room=${state.roomCode}`
              )
            }
          >
            Copy invite link
          </button>
        )}
        <div className="duel-wait-facts">
          <span>{state.mode === "quick" ? "⚡ Quick Duel" : "🔥 Question Rush"}</span>
          <span>{state.subject === "math" ? "∑ Math" : "Aa Reading & Writing"}</span>
          <span>{state.matchType === "ranked" ? `◈ ${state.me.rating} rating` : "◇ Rating off"}</span>
        </div>
        <button className="duel-cancel" onClick={() => void leaveWaiting()}>Cancel</button>
        {error && <p className="duel-error" role="alert">{error}</p>}
      </div>
    );
  }

  if (state.status === "completed") {
    const won = state.winnerId === state.me.id;
    const ratingChange = state.matchType === "private" ? null : won ? 20 : -15;
    return (
      <div className="dash-page duel-page duel-result-page">
        <div className={`duel-result-mark${won ? " won" : ""}`}>{won ? <Crown size={40} /> : <X size={40} />}</div>
        <span className="duel-kicker">MATCH COMPLETE</span>
        <h1>{won ? "Victory" : "Good duel"}</h1>
        <p>{won ? "You kept your lead when it mattered." : `${state.opponent?.name ?? "Your opponent"} took this one. Ready for a rematch?`}</p>
        <div className="duel-final-score">
          <div className={won ? "winner" : ""}><span>You</span><strong>{state.me.score}</strong><small>{ratingChange === null ? "Unranked" : `${ratingChange > 0 ? "+" : ""}${ratingChange} rating`}</small></div>
          <b>—</b>
          <div className={!won ? "winner" : ""}><span>{state.opponent?.name ?? "Opponent"}</span><strong>{state.opponent?.score ?? 0}</strong><small>{state.opponent?.rating ?? 1000} rating</small></div>
        </div>
        <div className="duel-result-actions">
          <button
            className="duel-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await rematchDuel(state.id);
                if (result.ok && result.state) {
                  setState(result.state);
                  setSelected("");
                  setError(null);
                } else {
                  setError(result.error ?? "Could not open the rematch.");
                }
              })
            }
          >
            {pending ? "Opening room…" : "Rematch · new room"}
          </button>
          <button className="duel-secondary" onClick={() => { setState(null); setError(null); }}>Play again</button>
          <a className="duel-secondary" href="/dashboard/leaderboard">View progress</a>
        </div>
      </div>
    );
  }

  const question = state.question;
  const isPaused = state.status === "paused";
  const suddenDeath = state.status === "sudden_death";
  return (
    <div className="dash-page duel-page duel-arena">
      <header className="duel-match-head">
        <div className="duel-live"><i /> LIVE · {state.matchType === "ranked" ? "RANKED" : "PRIVATE"}</div>
        <div className={`duel-clock${secondsLeft <= 30 && state.endsAt ? " danger" : ""}`}>
          <small>{suddenDeath ? "SUDDEN DEATH" : state.mode === "quick" ? "FIRST CORRECT WINS" : "TIME LEFT"}</small>
          <strong>{suddenDeath ? "∞" : formatTime(secondsLeft)}</strong>
        </div>
        <div className="duel-match-meta">{state.subject === "math" ? "Math" : "Reading & Writing"} · {state.mode === "quick" ? "Quick" : "Rush"}</div>
      </header>

      <section className="duel-scoreboard" aria-label="Live score">
        <div className="duel-player me"><div className="duel-avatar">Y</div><span><strong>You</strong><small>{state.me.rating} rating · Q{state.me.questionIndex + 1}</small></span><b>{state.me.score}</b></div>
        <div className="duel-versus"><span>VS</span><i /></div>
        <div className="duel-player opponent"><b>{state.opponent?.score ?? 0}</b><span><strong>{state.opponent?.name ?? "Opponent"}</strong><small>{state.opponent?.rating ?? 1000} rating · Q{(state.opponent?.questionIndex ?? 0) + 1}</small></span><div className="duel-avatar">{state.opponent?.name?.slice(0, 1).toUpperCase() ?? "?"}</div></div>
      </section>

      {notice && <div className={`duel-answer-toast ${notice.kind}`} role="status">{notice.text}</div>}
      {question ? (
        <section className="duel-question-card" aria-live="polite">
          <div className="duel-question-meta"><span>QUESTION {state.me.questionIndex + 1}</span><i>{question.difficulty}</i><i>{question.domain}</i></div>
          {(question.passage || question.passage_html) && <div className="duel-passage"><QuestionText html={question.passage_html} text={question.passage ?? ""} /></div>}
          <div className="duel-question-text"><QuestionText html={question.question_text_html} text={question.question_text} /></div>
          {question.is_grid_in ? (
            <input className="duel-grid-answer" value={selected} inputMode="decimal" autoFocus placeholder="Type your answer" onChange={(event) => setSelected(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void answer(); }} />
          ) : (
            <div className={`duel-choices${(question.choices ?? []).some((choice) => /<(figure|table|svg|img)\b/i.test(choice.html ?? "")) ? " wide" : ""}`}>
              {(question.choices ?? []).map((choice) => (
                <button key={choice.label} className={selected === choice.label ? "selected" : ""} onClick={() => setSelected(choice.label)}>
                  <span>{choice.label}</span>
                  <span className="duel-choice-body"><QuestionText html={choice.html} text={choice.text} /></span>
                </button>
              ))}
            </div>
          )}
          <button className="duel-submit" disabled={pending || !selected.trim()} onClick={() => void answer()}>{pending ? "Checking…" : "Lock answer"}</button>
          {error && <p className="duel-error" role="alert">{error}</p>}
        </section>
      ) : <div className="duel-question-card"><p>Loading the next question…</p></div>}

      {isPaused && (
        <div className="duel-pause-overlay" role="alertdialog" aria-modal="true" aria-label="Duel paused">
          <div><WifiOff size={28} /><span>DUEL PAUSED</span><h2>Opponent disconnected</h2><p>Both clocks are paused. They have <strong>{reconnectLeft}s</strong> to return.</p><div className="duel-reconnect-track"><span style={{ width: `${(reconnectLeft / 30) * 100}%` }} /></div></div>
        </div>
      )}
    </div>
  );
}
