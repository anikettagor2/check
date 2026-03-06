"use client";

/* 
import { Navbar } from "@/components/navbar";
import { FuturisticBackground } from "@/components/futuristic-background";
import { FuturisticHero } from "@/components/futuristic-hero";
import { FuturisticFeatures } from "@/components/futuristic-features";
import { FuturisticCTA } from "@/components/futuristic-cta";
import { FuturisticProcess } from "@/components/futuristic-process";
import { motion } from "framer-motion";
import { Work } from "@/components/work";
import { Footer } from "@/components/footer";
import { SmoothScroll } from "@/components/smooth-scroll";
*/

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6 text-center">
      <div className="max-w-2xl space-y-6">
        <div className="h-1 w-20 bg-primary mx-auto rounded-full mb-8 opacity-50" />
        <h1 className="text-2xl md:text-3xl font-heading font-black tracking-tight uppercase leading-tight">
          System <span className="text-primary italic">Protocol</span> Halted
        </h1>
        <p className="text-zinc-400 text-lg md:text-xl font-medium leading-relaxed">
          The website is temporarily unavailable due to pending developer payment. 
          Services will resume once the outstanding payment is cleared.
        </p>
        <div className="pt-8 opacity-20 text-[10px] font-bold uppercase tracking-[0.5em]">
          Operational Hold Active
        </div>
      </div>
    </main>
  );
}

/* Old Page Content for Reference
import { Navbar } from "@/components/navbar";
import { FuturisticBackground } from "@/components/futuristic-background";
import { FuturisticHero } from "@/components/futuristic-hero";
import { FuturisticFeatures } from "@/components/futuristic-features";
import { FuturisticCTA } from "@/components/futuristic-cta";
import { FuturisticProcess } from "@/components/futuristic-process";
import { motion } from "framer-motion";
import { Work } from "@/components/work";
import { Footer } from "@/components/footer";
import { SmoothScroll } from "@/components/smooth-scroll";

export function OriginalHome() {
  return (
    <main className="bg-background text-foreground overflow-x-hidden relative">
      <SmoothScroll />
      <FuturisticBackground />
      
      <div className="relative z-10">
        <Navbar />
        <FuturisticHero />
        <FuturisticFeatures />
        <FuturisticProcess />
        <WorkWrapper />

        <FuturisticCTA />
        <Footer />
      </div>
    </main>
  );
}

function WorkWrapper() {
    return (
        <section id="work" className="relative z-20 py-24 bg-transparent">
            <div className="max-w-7xl mx-auto px-6 mb-12 flex flex-col items-center">
                 <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="text-primary font-black tracking-[0.4em] uppercase text-xs mb-4"
                 >
                    Portfolio
                 </motion.div>
                 <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase text-center text-white">
                    Our <span className="text-primary italic">Reels</span>
                 </h2>
            </div>
            <Work />
        </section>
    )
}
*/

