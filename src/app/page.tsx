import Header from "@/components/Header";
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
import { getCurrentUser } from "@/lib/supabase/auth";
export const metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const signedIn = Boolean(await getCurrentUser());

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header signedIn={signedIn} />
      <main id="main">
        <Hero signedIn={signedIn} />
        <Marquee />
        <Stats />
        <HowItWorks />
        <QuestionBank />
        <StudyPlan />
        <Gamification />
        <ScorePredictor />
        <Pricing signedIn={signedIn} />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
