"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signup" | "signin";
type FieldKey = "fullName" | "email" | "password" | "confirm";

const FIELD_MESSAGES: Record<FieldKey, string> = {
  fullName: "Tell us your name so your plan can greet you.",
  email: "Enter an email like you@school.com.",
  password: "Use at least 8 characters.",
  confirm: "The two passwords don't match.",
};

/** Turn Supabase's terse auth errors into something a student can act on. */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "That email already has an account. Sign in instead.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts — wait a minute and try again.";
  }
  if (m.includes("password should be") || m.includes("password is too short")) {
    return "Use at least 8 characters for your password.";
  }
  if (m.includes("unable to validate email")) return "That email address doesn't look valid.";
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return message;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const submitting = useRef(false);

  const invalid = useMemo(() => {
    const problems: Partial<Record<FieldKey, string>> = {};
    if (mode === "signup" && fullName.trim().length < 2) problems.fullName = FIELD_MESSAGES.fullName;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) problems.email = FIELD_MESSAGES.email;
    if (password.length < 8) problems.password = FIELD_MESSAGES.password;
    if (mode === "signup" && confirm !== password) problems.confirm = FIELD_MESSAGES.confirm;
    return problems;
  }, [mode, fullName, email, password, confirm]);

  const valid = Object.keys(invalid).length === 0;

  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setTouched({});
    setPassword("");
    setConfirm("");
  }

  function blur(field: FieldKey) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function fieldError(field: FieldKey) {
    return touched[field] ? invalid[field] : undefined;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;

    // Reveal every problem at once if they hit Enter early.
    if (!valid) {
      setTouched({ fullName: true, email: true, password: true, confirm: true });
      return;
    }

    submitting.current = true;
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const supabase = createClient();
      const cleanEmail = email.trim();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/onboarding`,
          },
        });
        if (signUpError) {
          setError(friendlyError(signUpError.message));
        } else if (data.session) {
          // Email confirmation is off — go straight into setup.
          router.replace("/onboarding");
        } else {
          setMessage(
            `Account created. We sent a confirmation link to ${cleanEmail} — open it, then sign in.`
          );
          setMode("signin");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          setError(friendlyError(signInError.message));
        } else if (data.user) {
          // Brand-new accounts go through setup; everyone else lands on the
          // dashboard. Both checks go out together, and the redirect is a
          // single replace() — the destination re-fetches itself.
          const [profile, attempts] = await Promise.all([
            supabase.from("profiles").select("test_date").eq("id", data.user.id).maybeSingle(),
            supabase
              .from("practice_attempts")
              .select("*", { count: "exact", head: true })
              .eq("user_id", data.user.id),
          ]);
          const fresh = !profile.data?.test_date && (attempts.count ?? 0) === 0;
          router.replace(fresh ? "/onboarding" : "/dashboard");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? friendlyError(err.message) : "Authentication failed. Please try again."
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
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
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
          <button
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-tab${mode === "signin" ? " active" : ""}`}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === "signup" && (
            <label className="field">
              <span className="field-label">Full name</span>
              <input
                className="field-input"
                type="text"
                name="name"
                autoComplete="name"
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => blur("fullName")}
                aria-invalid={Boolean(fieldError("fullName"))}
                required
              />
              {fieldError("fullName") && <span className="field-error">{fieldError("fullName")}</span>}
            </label>
          )}

          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoFocus={mode === "signin"}
              placeholder="you@school.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => blur("email")}
              aria-invalid={Boolean(fieldError("email"))}
              required
            />
            {fieldError("email") && <span className="field-error">{fieldError("email")}</span>}
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <span className="field-password">
              <input
                className="field-input"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => blur("password")}
                aria-invalid={Boolean(fieldError("password"))}
                minLength={8}
                required
              />
              <button
                type="button"
                className="field-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
            {fieldError("password") ? (
              <span className="field-error">{fieldError("password")}</span>
            ) : mode === "signup" && password.length > 0 ? (
              <span className="password-strength">
                <span className="password-strength-bar" aria-hidden="true">
                  <span data-score={strength} style={{ width: `${(strength / 4) * 100}%` }} />
                </span>
                <span className="field-help">
                  {["Too short", "Weak", "Okay", "Good", "Strong"][strength]}
                </span>
              </span>
            ) : null}
          </label>

          {mode === "signup" && (
            <label className="field">
              <span className="field-label">Confirm password</span>
              <input
                className="field-input"
                type={showPassword ? "text" : "password"}
                name="confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => blur("confirm")}
                aria-invalid={Boolean(fieldError("confirm"))}
                required
              />
              {fieldError("confirm") && <span className="field-error">{fieldError("confirm")}</span>}
            </label>
          )}

          <div className="auth-feedback" aria-live="polite">
            {error && <p className="feedback bad">{error}</p>}
            {message && <p className="feedback ok">{message}</p>}
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
            {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          <p className="field-help auth-alt">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" className="auth-link" onClick={() => switchMode("signin")}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button type="button" className="auth-link" onClick={() => switchMode("signup")}>
                  Create an account
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </main>
  );
}
