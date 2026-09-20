import Link from "next/link";
export default function NotFound() {
  return <main className="auth-shell"><h1>Page not found</h1><p>This page may have moved.</p><Link className="btn btn-primary" href="/dashboard">Dashboard</Link><Link className="btn btn-ghost" href="/">Home</Link></main>;
}
