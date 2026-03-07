"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { LenisProvider } from "@/components/home/lenis-provider";
import { CustomCursor } from "@/components/home/custom-cursor";
import { ImmersiveBackground } from "@/components/home/immersive-background";
import { ParallaxGallery } from "@/components/home/parallax-gallery";
import { BeforeAfter } from "@/components/home/before-after";
import { motion } from "framer-motion";

export default function PortfolioPage() {
  return (
    <LenisProvider>
      <main className="bg-black text-white overflow-x-hidden selection:bg-primary selection:text-white">
        <CustomCursor />
        <ImmersiveBackground />
        <Navbar />
        
        {/* Portfolio Hero */}
        <section className="relative min-h-[70vh] flex items-center justify-center pt-32 px-6">
            <div className="relative z-10 max-w-7xl mx-auto text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="premium-header mb-6 text-primary"
                >
                    Archive
                </motion.div>
                <motion.h1 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-none mb-8"
                >
                    Director's <br />
                    <span className="italic text-primary">Lookbook</span>
                </motion.h1>
                <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-zinc-500 text-xl md:text-2xl max-w-2xl mx-auto font-medium"
                >
                    A collection of high-impact visuals and storytelling sequences that defined new eras for our clients.
                </motion.p>
            </div>
        </section>

        {/* Portfolio Content */}
        <ParallaxGallery />
        
        <div className="py-20 text-center">
            <div className="h-[1px] w-32 bg-white/10 mx-auto" />
        </div>

        <section className="py-20">
            <div className="max-w-7xl mx-auto px-6 mb-20 text-center">
                <h2 className="text-4xl md:text-6xl font-black uppercase text-white tracking-widest leading-none mb-4">The Magic <span className="text-primary italic">Between</span> Frames</h2>
                <p className="text-zinc-500 text-lg">Swipe to see the transformation of raw footage.</p>
            </div>
            <BeforeAfter />
        </section>

        <Footer />
      </main>
    </LenisProvider>
  );
}
