"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Mode = "signup" | "signin";
type FieldKey = "fullName" | "nickname" | "email" | "password";
type OAuthProvider = "google" | "github";

// A social button only goes live once its provider really works: a valid client
// id + secret in Supabase → Authentication → Providers, and
// https://<project-ref>.supabase.co/auth/v1/callback registered as the redirect
// URI inside the provider's own console. Until then the button renders dimmed,
// rather than dropping the student on the provider's error page.
//
// The switch is the env var, not this file: set
// NEXT_PUBLIC_OAUTH_PROVIDERS=google,github in Vercel (and in .env.local for
// local work), then redeploy — NEXT_PUBLIC_* values are inlined at build time.
const OAUTH_ENABLED = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

const providerReady = (provider: OAuthProvider) => OAUTH_ENABLED.includes(provider);

const OAUTH_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
};

const OAUTH_ORDER: OAuthProvider[] = ["google", "github"];

// Official brand marks (simple-icons), one path each — rendered with currentColor
// except Google, whose mark is always shown in colour.
const OAUTH_PATHS: Record<Exclude<OAuthProvider, "google">, string> = {
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
};

function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.4 1.79 14.94.75 12 .75 7.6.75 3.8 3.27 1.96 6.96l3.66 2.84C6.5 7.02 9 5.04 12 5.04z" />
        <path fill="#4285F4" d="M23.25 12.27c0-.92-.08-1.6-.26-2.3H12v4.19h6.44c-.13 1.08-.83 2.7-2.39 3.8l3.57 2.77c2.14-1.98 3.63-4.89 3.63-8.46z" />
        <path fill="#FBBC05" d="M5.62 14.2A7.06 7.06 0 0 1 5.24 12c0-.76.14-1.5.36-2.2L1.96 6.96A11.24 11.24 0 0 0 .75 12c0 1.81.44 3.52 1.21 5.04l3.66-2.84z" />
        <path fill="#34A853" d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.57-2.77c-.96.65-2.24 1.1-3.89 1.1-3 0-5.5-1.98-6.38-4.66l-3.66 2.84c1.84 3.69 5.64 6.21 10.04 6.21z" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d={OAUTH_PATHS[provider]} />
    </svg>
  );
}

const FIELD_MESSAGES: Record<FieldKey, string> = {
  fullName: "Use at least 2 characters.",
  nickname: "Use 3–24 lowercase letters, numbers, or underscores.",
  email: "Enter an email like you@school.com.",
  password: "Use at least 8 characters.",
};

/** Turn Supabase's terse auth errors into something a student can act on. */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox and spam, or resend the link below.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "That email already has an account. Sign in instead.";
  }
  if (m.includes("over_email_send_rate_limit") || m.includes("email rate limit")) {
    return "We couldn't send that email — the mail service is at its limit right now. Try again in a few minutes.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts — wait a minute and try again.";
  }
  if (m.includes("password should be") || m.includes("password is too short")) {
    return "Use at least 8 characters for your password.";
  }
  if (m.includes("unable to validate email") || m.includes("email_address_invalid")) {
    return "That email address doesn't look valid.";
  }
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return message;
}

/**
 * One less field to fill in: the community handle is derived from the email.
 * It stays editable later in Settings → community profile.
 */
async function pickUsername(supabase: SupabaseClient, email: string): Promise<string> {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 18);
  const seed = base.length >= 3 ? base : `sat_${base || "player"}`;
  const candidates = [
    seed,
    ...Array.from({ length: 4 }, () => `${seed.slice(0, 15)}${Math.floor(1000 + Math.random() * 9000)}`),
  ];
  for (const candidate of candidates) {
    const { data, error } = await supabase.rpc("is_username_available", { candidate });
    if (!error && data) return candidate;
  }
  return `${seed.slice(0, 14)}${Date.now().toString().slice(-6)}`.slice(0, 24);
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const submitting = useRef(false);

  /** Nickname we suggest from the email until they type their own. */
  const suggestedNickname = useMemo(() => {
    const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 18);
    return base.length >= 3 ? base : base ? `sat_${base}` : "";
  }, [email]);
  const effectiveNickname = (nicknameTouched ? nickname : suggestedNickname).trim();

  // Deep links from the email land back here with a notice to explain. The URL
  // is only readable on the client, so this runs after mount by design.
  useEffect(() => {
    const notice = new URLSearchParams(window.location.search).get("notice");
    if (notice === "link-expired") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only URL read
      setMode("signin");
      setNeedsConfirm(true);
      setError("That link has already been used or expired. Sign in, or send yourself a fresh one.");
    } else if (notice === "link-missing") {
      setError("That link was incomplete — copy the whole link from the email, or resend it below.");
      setNeedsConfirm(true);
    } else if (notice === "supabase-not-configured") {
      setError("Email sign-in isn't switched on for this site yet.");
    } else if (notice === "oauth-failed") {
      setError("That sign-in didn't finish. Try again, or use your email and password below.");
    }
  }, []);

  /** Federated sign-in: the provider runs the flow and lands back on our callback. */
  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(friendlyError(error.message));
    } catch {
      setError(`Couldn't start ${OAUTH_LABELS[provider]} sign-in. Check your connection and try again.`);
    }
  }

  const invalid = useMemo(() => {
    const problems: Partial<Record<FieldKey, string>> = {};
    // The name is a nicety, not a gate — blank is fine, it falls back to the
    // email handle so the plan still has something to greet them with.
    if (mode === "signup" && fullName.trim().length === 1) problems.fullName = FIELD_MESSAGES.fullName;
    // Nickname is optional, but if they pick one it must be a legal handle.
    if (mode === "signup" && effectiveNickname && !/^[a-z0-9_]{3,24}$/.test(effectiveNickname)) {
      problems.nickname = FIELD_MESSAGES.nickname;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) problems.email = FIELD_MESSAGES.email;
    if (mode === "signup" ? password.length < 8 : !password.length) {
      problems.password = mode === "signup" ? FIELD_MESSAGES.password : "Enter your password.";
    }
    return problems;
  }, [mode, fullName, effectiveNickname, email, password]);

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
    setNeedsConfirm(false);
  }

  /** The one thing a stuck student can retry without retyping anything. */
  async function resendConfirmation() {
    const cleanEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Type your email above first, then tap resend.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/auth/verified` },
      });
      if (error) setError(friendlyError(error.message));
      else setMessage(`Sent again to ${cleanEmail}. Check your inbox and spam folder.`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
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
      setTouched({ fullName: true, email: true, password: true });
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
        // Nickname is theirs to choose; ours is only the fallback.
        const cleanNickname = effectiveNickname || (await pickUsername(supabase, cleanEmail));
        const displayName =
          fullName.trim() ||
          cleanEmail
            .split("@")[0]
            .replace(/[._-]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .slice(0, 40);
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: displayName, username: cleanNickname },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/auth/verified`,
          },
        });
        if (signUpError) {
          setError(friendlyError(signUpError.message));
          // A failed confirmation send leaves the account waiting for a link.
          if (/rate|confirm|email/i.test(signUpError.message)) setNeedsConfirm(true);
        } else if (data.session) {
          // Email confirmation is off — go straight into setup.
          router.replace("/onboarding");
        } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          // Supabase answers a signup for an existing email with an obfuscated
          // user and no identities. Without this branch the page claimed it had
          // emailed a link, which never arrives for an account that exists.
          setMode("signin");
          setMessage(`That email already has an account — sign in with your password instead.`);
          setNeedsConfirm(false);
        } else {
          setNeedsConfirm(true);
          setMessage(`Check ${cleanEmail} for the confirmation link, then sign in.`);
          setMode("signin");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          setError(friendlyError(signInError.message));
          if (/not confirmed/i.test(signInError.message)) setNeedsConfirm(true);
        } else if (data.user) {
          // Hard navigation ON PURPOSE: a client-router replace right after
          // sign-in raced the cookie/RSC state and intermittently bounced
          // back to /auth. The full page load sidesteps the client router.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/dashboard");
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
        <p className="field-help auth-sub">
          {mode === "signup"
            ? "An email and a password is all it takes — your name is optional and you can change both later."
            : "Welcome back."}
        </p>

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
              <span className="field-label">
                Your name <span className="field-optional">optional</span>
              </span>
              <input
                className="field-input"
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Alex"
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => blur("fullName")}
                aria-invalid={Boolean(fieldError("fullName"))}
              />
              {fieldError("fullName") ? (
                <span className="field-error">{fieldError("fullName")}</span>
              ) : (
                <span className="field-help">Only used to greet you.</span>
              )}
            </label>
          )}

          {mode === "signup" && (
            <label className="field">
              <span className="field-label">
                Nickname <span className="field-optional">yours to pick</span>
              </span>
              <span className="field-prefixed">
                <span aria-hidden="true">@</span>
                <input
                  className="field-input"
                  type="text"
                  name="nickname"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={24}
                  placeholder={suggestedNickname || "your_nickname"}
                  value={nicknameTouched ? nickname : suggestedNickname}
                  onChange={(e) => {
                    setNicknameTouched(true);
                    setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                  }}
                  onBlur={() => blur("nickname")}
                  aria-invalid={Boolean(fieldError("nickname"))}
                />
              </span>
              {fieldError("nickname") ? (
                <span className="field-error">{fieldError("nickname")}</span>
              ) : (
                <span className="field-help">
                  This is how students find you. We suggested one — change it if you like.
                </span>
              )}
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

          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <span className="field-password">
              <input
                className="field-input"
                type={showPassword ? "text" : "password"}
                name="password"
                id="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => blur("password")}
                aria-invalid={Boolean(fieldError("password"))}
                minLength={mode === "signup" ? 8 : 1}
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
          </div>
          {mode === "signin" && <Link className="auth-link" href="/auth/forgot">Forgot password?</Link>}

          <div className="auth-feedback" aria-live="polite">
            {error && <p className="feedback bad">{error}</p>}
            {message && <p className="feedback ok">{message}</p>}
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
            {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {needsConfirm && (
            <button className="btn btn-ghost auth-resend" type="button" onClick={resendConfirmation} disabled={loading}>
              Resend the confirmation email
            </button>
          )}

          <div className="auth-divider" role="separator" aria-label="Or">
            <span>or</span>
          </div>

          <div className="auth-oauth">
            {OAUTH_ORDER.map((provider) => {
              const ready = providerReady(provider);
              return (
                <button
                  key={provider}
                  className={`btn btn-ghost btn-oauth${ready ? "" : " soon"}`}
                  type="button"
                  onClick={() => handleOAuth(provider)}
                  disabled={loading || !ready}
                  aria-disabled={!ready}
                  title={ready ? undefined : `${OAUTH_LABELS[provider]} sign-in is being switched on — email works today.`}
                >
                  <span className="btn-oauth-icon" aria-hidden="true">
                    <ProviderMark provider={provider} />
                  </span>
                  <span className="btn-oauth-label">Continue with {OAUTH_LABELS[provider]}</span>
                </button>
              );
            })}
          </div>

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
