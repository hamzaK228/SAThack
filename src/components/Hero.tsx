import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Hero() {
  return <section className="intro-band" id="top"><div className="wrap">
    <p className="eyebrow">Digital SAT practice</p>
    <h1>SAThack</h1>
    <p className="intro-description">Practice with purpose. Understand your mistakes. Build your next study session around what you need.</p>
    <div className="intro-actions"><Link className="btn btn-primary btn-lg" href="/auth">Start practicing <ArrowRight size={20}/></Link><a className="btn btn-ghost btn-lg" href="#bank">Explore the question bank</a></div>
  </div></section>;
}

