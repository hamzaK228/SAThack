import Header from "@/components/Header";
import Image from "next/image";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Stats from "@/components/Stats";
import HowItWorks from "@/components/HowItWorks";
import QuestionBank from "@/components/QuestionBank";
import StudyPlan from "@/components/StudyPlan";
import Gamification from "@/components/Gamification";
import ScorePredictor from "@/components/ScorePredictor";
import Pricing from "@/components/Pricing";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
export const metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <section className="practice-preview wrap" aria-label="SAThack practice preview">
          <Image src="/practice-preview.png" width={858} height={770} alt="SAThack Reading and Writing practice with a passage, answer choices, review marker, and timer" sizes="(max-width: 760px) 100vw, 1000px" priority />
        </section>
        <Marquee />
        <Stats />
        <HowItWorks />
        <QuestionBank />
        <StudyPlan />
        <Gamification />
        <ScorePredictor />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
