"use client";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { LenisProvider } from "@/components/home/lenis-provider";
import { CustomCursor } from "@/components/home/custom-cursor";
import { ImmersiveBackground } from "@/components/home/immersive-background";
import { StickyScroll } from "@/components/home/sticky-scroll";
import { EditingTimeline } from "@/components/home/editing-timeline";
import { motion } from "framer-motion";

export default function ServicesPage() {
  return (
    <LenisProvider>
      <main className="bg-black text-white overflow-x-hidden selection:bg-primary selection:text-white">
        <CustomCursor />
        <ImmersiveBackground />
        <Navbar />
        
        {/* Service Hero */}
        <section className="relative min-h-[80vh] flex items-center justify-center pt-32 px-6">
            <div className="absolute inset-0 bg-radial-gradient from-primary/10 via-transparent to-transparent opacity-50" />
            <div className="relative z-10 max-w-7xl mx-auto text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="premium-header mb-6 text-primary"
                >
                    Solutions
                </motion.div>
                <motion.h1 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-none mb-8"
                >
                    Engineered <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-500 to-primary italic">Excellence</span>
                </motion.h1>
                <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-zinc-500 text-xl md:text-2xl max-w-2xl mx-auto font-medium"
                >
                    From raw footage to cinematic masterpiece. We provide end-to-end post-production services that redefine industry standards.
                </motion.p>
            </div>
        </section>

        {/* Reusing existing majestic interactive components */}
        <StickyScroll />
        <EditingTimeline />

        {/* Specific Service Grid */}
        <section className="py-40 px-6 bg-black">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <ServiceCard 
                        title="VFX & Motion" 
                        desc="Advanced visual effects and dynamic motion graphics that push the boundaries of reality."
                        index={1}
                    />
                    <ServiceCard 
                        title="Color Science" 
                        desc="Precision grading and bespoke LUT development tailored to your specific brand narrative."
                        index={2}
                    />
                    <ServiceCard 
                        title="Sound Design" 
                        desc="Spatial audio engineering and custom foley that creates a truly immersive auditory world."
                        index={3}
                    />
                </div>
            </div>
        </section>
        
        <Footer />
      </main>
    </LenisProvider>
  );
}

function ServiceCard({ title, desc, index }: { title: string, desc: string, index: number }) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="p-12 rounded-[2.5rem] bg-zinc-950 border border-white/5 hover:border-primary/30 transition-all duration-500 group"
        >
            <div className="text-primary font-black text-xs tracking-widest mb-8">0{index}</div>
            <h3 className="text-3xl font-black uppercase text-white mb-6 group-hover:text-primary transition-colors">{title}</h3>
            <p className="text-zinc-500 text-lg leading-relaxed">{desc}</p>
        </motion.div>
    );
}
