import Link from "next/link";
export default function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  return <section className="section" id="pricing"><div className="wrap">
    <div className="section-head"><p className="eyebrow">Access</p><h2>Free while we build.</h2><p>Question practice, your review queue, study plans, and progress tracking are available with a free account. No payment details required.</p></div>
    <Link className="btn btn-primary" href={signedIn ? "/dashboard" : "/auth"}>{signedIn ? "Return to dashboard" : "Start practicing"}</Link>
  </div></section>;
}
