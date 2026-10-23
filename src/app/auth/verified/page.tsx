"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Landing screen for the email-confirmation link. The callback route sends
 * confirmed sign-ups here for a beat of positive feedback before onboarding —
 * the student just clicked a link in their inbox; show them it worked.
 */
export default function VerifiedPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const tick = window.setInterval(() => setCountdown((c) => c - 1), 1000);
    const done = window.setTimeout(() => router.replace("/onboarding"), 3200);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [router]);

  return (
    <main id="main" className="auth-shell">
      <div className="auth-topbar">
        <Link className="brand" href="/" aria-label="SAThack home">
          <span className="brand-prompt" aria-hidden="true">&gt;</span>
          <span className="brand-name">SAThack</span>
        </Link>
      </div>

      <div className="auth-card" role="status">
        <p className="eyebrow">&gt; email confirmed</p>
        <h1 className="auth-title">You&apos;re in. ✓</h1>
        <p className="auth-sub" style={{ marginTop: "0.75rem" }}>
          Your email is verified and your account is live.
          Taking you to setup <strong>{Math.max(countdown, 0)}</strong>…
        </p>
        <Link className="btn btn-primary btn-lg" href="/onboarding" style={{ marginTop: "1.5rem" }}>
          Start setup now →
        </Link>
      </div>
    </main>
  );
}
