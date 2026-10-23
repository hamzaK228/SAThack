import Link from "next/link";
export const metadata={title:"Privacy | SAThack",alternates:{canonical:"/privacy"}};
export default function Privacy(){return <main className="legal-page"><Link href="/">SAThack</Link><h1>Privacy</h1><p>Updated October 23, 2026.</p>
  <h2>Information used by the app</h2><p>Your account stores your email, name, score goals, test date, practice answers, saved questions, vocabulary progress, test sessions, and study plans. This information supports sign-in, practice history, and personalized study tools.</p>
  <h2>Providers and storage</h2><p>Supabase provides account and database services. Vercel hosts the website. Authentication uses cookies. Some practice progress is also stored in your browser. Opening the external Desmos calculator connects you to Desmos.</p>
  <h2>AI tutor</h2><p>When AI is configured, your message and relevant question or study context are sent to the configured AI provider to produce an answer. Do not include passwords, payment details, or sensitive personal information in tutor messages.</p>
  <h2>Shared progress</h2><p>The leaderboard displays account names and practice statistics to signed-in users. Avoid using identifying information in your display name if you do not want it shown there. You can also create an expiring, read-only progress link for a parent or mentor; it shows aggregate practice statistics and recent test scores, never answers or your email, and you can revoke it at any time.</p>
  <h2>Weekly digest</h2><p>The weekly digest is opt-in. If you turn it on, your email address is used to send one summary a week (questions practised, accuracy, active days and XP); turn it off in Settings to stop it. It is sent through the configured email provider, not used for advertising.</p>
  <h2>Your account</h2><p>Account settings provide a data export and account deletion. Deletion removes active account records; existing provider backups may remain until they expire. Data already downloaded to a browser is not remotely erased.</p>
  <p><Link href="/dashboard/settings">Account settings</Link> · <Link href="/terms">Terms</Link></p>
</main>;}
