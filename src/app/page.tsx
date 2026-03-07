"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { LenisProvider } from "@/components/home/lenis-provider";
import { Hero } from "@/components/home/hero";
import { StickyScroll } from "@/components/home/sticky-scroll";
import { BeforeAfter } from "@/components/home/before-after";
import { ParallaxGallery } from "@/components/home/parallax-gallery";
import { ScrollText } from "@/components/home/scroll-text";
import { FuturisticCTA } from "@/components/futuristic-cta";
import { CustomCursor } from "@/components/home/custom-cursor";
import { ImmersiveBackground } from "@/components/home/immersive-background";
import { EditingTimeline } from "@/components/home/editing-timeline";

export default function Home() {
  return (
    <LenisProvider>
      <main className="bg-black text-white overflow-x-hidden selection:bg-primary selection:text-white">
        <CustomCursor />
        <ImmersiveBackground />
        <Navbar />
        
        <Hero />
        
        <ScrollText />
        
        <StickyScroll />

        <EditingTimeline />
        
        <BeforeAfter />
        
        <ParallaxGallery />

        <FuturisticCTA />
        
        <Footer />
      </main>
    </LenisProvider>
  );
}
