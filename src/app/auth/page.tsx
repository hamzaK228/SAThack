"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });
      if (error) setError(error.message);
      else if (data.session) {
        // Email confirmation is off — go straight into setup.
        router.push("/onboarding");
        router.refresh();
      } else setMessage("Account created — check your email to confirm, then sign in.");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        // Brand-new accounts go through setup; everyone else lands on the dashboard.
        const { data: profile } = await supabase
          .from("profiles")
          .select("test_date")
          .eq("id", data.user.id)
          .maybeSingle();
        const { count } = await supabase
          .from("practice_attempts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", data.user.id);
        const fresh = !profile?.test_date && (count ?? 0) === 0;
        router.push(fresh ? "/onboarding" : "/dashboard");
        router.refresh();
      }
    }
    setLoading(false);
  }

  return (
    <main id="main" className="auth-shell">
      <div className="auth-topbar">
        <Link className="brand" href="/" aria-label="SAThack home">
          <span className="brand-prompt" aria-hidden="true">
            &gt;
          </span>
          <span className="brand-name">SAThack</span>
        </Link>
        <Link className="btn btn-ghost" href="/">
          Back to home
        </Link>
      </div>

      <div className="auth-card">
        <p className="eyebrow">Read the system. Ace the SAT.</p>
        <h1 className="auth-title">{mode === "signup" ? "Create your account" : "Sign in"}</h1>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-tab${mode === "signup" ? " active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError(null);
              setMessage(null);
            }}
          >
            Sign up
          </button>
          <button
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-tab${mode === "signin" ? " active" : ""}`}
            onClick={() => {
              setMode("signin");
              setError(null);
              setMessage(null);
            }}
          >
            Sign in
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="field-input"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
          )}

          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>

          {error && <p className="feedback bad">{error}</p>}
          {message && <p className="feedback ok">{message}</p>}

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
            {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
