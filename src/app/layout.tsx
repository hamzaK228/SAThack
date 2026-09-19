import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";
import "./usability.css";
import "katex/dist/katex.min.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  openGraph: { title: "SAThack", description: "Digital SAT practice, study plans, and progress tracking.", type: "website", siteName: "SAThack", images: [{url:"/practice-preview.png",width:858,height:770,alt:"SAThack practice"}] },
  twitter: { card: "summary_large_image", title: "SAThack", description: "Digital SAT practice, study plans, and progress tracking.", images:["/practice-preview.png"] },
  title: "SAThack — Read the system. Ace the SAT.",
  description:
    "SAThack is an adaptive Digital SAT platform that starts with your real score, maps the domains costing you points, and rebuilds your plan every time your accuracy changes.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
