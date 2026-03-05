"use client";

import React, { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button } from "./ui/button";
import { Play, ArrowRight, Zap, Shield, Star, MousePointer2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

export function FuturisticHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const videoRevealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !titleRef.current || !videoRevealRef.current) return;

    // Orchestrated Scroll Animation
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "+=150%",
        scrub: 1.5,
        pin: true,
      },
    });

    tl.to(titleRef.current, {
      y: -150,
      opacity: 0,
      scale: 0.8,
      filter: "blur(20px)",
      duration: 1.5,
    })
    .to(videoRevealRef.current, {
      y: "-50%",
      scale: 1,
      opacity: 1,
      borderRadius: "0px",
      width: "100vw",
      height: "100vh",
      duration: 2,
    }, 0.2)
    // Blur the image inside after it expansion
    .to(".production-image", {
      filter: "blur(8px) brightness(0.5)",
      scale: 1.1,
      duration: 1
    }, ">-0.5")
    // Fade in and scale up the stats
    .fromTo(".stat-card", 
      { opacity: 0, y: 50, scale: 0.8 },
      { opacity: 1, y: 0, scale: 1, stagger: 0.2, duration: 1 },
      "<"
    );

    return () => {
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-[#0F1115]">
      {/* Hero Content Layer */}
      <div ref={titleRef} className="relative z-30 w-full max-w-[1400px] px-6 text-center">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.6 }}
           className="mb-8"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-primary text-[10px] font-black tracking-[0.3em] uppercase backdrop-blur-md">
            <Zap className="w-3 h-3 fill-primary" />
            Next-Gen Video Agency
          </span>
        </motion.div>

        <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-black tracking-tighter leading-[0.8] mb-10 text-white select-none">
          <div className="overflow-hidden inline-block">
            <motion.span 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="block"
            >
              UNLEASH
            </motion.span>
          </div>
          <br />
          <div className="overflow-hidden inline-block text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-400 to-neon-blue">
             <motion.span 
               initial={{ y: "100%" }}
               animate={{ y: 0 }}
               transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
               className="block italic"
             >
               CREATIVE
             </motion.span>
          </div>
          <br />
          <div className="overflow-hidden inline-block">
            <motion.span 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="block"
            >
              POWER
            </motion.span>
          </div>
        </h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="max-w-xl mx-auto mb-12"
        >
          <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed">
            We don&apos;t just edit videos. We build visual identities for the world&apos;s most ambitious creators and brands.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6"
        >
            <Link href="/login">
              <Button size="lg" className="h-16 px-10 rounded-full text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-all scale-110">
                Launch Project
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <button className="flex items-center gap-3 text-white/70 hover:text-white transition-colors group px-6 py-2">
                <Play className="w-5 h-5 fill-white/20 group-hover:fill-white transition-all" />
                <span className="font-bold tracking-widest text-sm">WATCH SHOWREEL</span>
            </button>
        </motion.div>
      </div>

      {/* Video Reveal Layer */}
      <div 
        ref={videoRevealRef}
        className="absolute top-[80%] left-1/2 -translate-x-1/2 w-[90%] max-w-[1400px] h-[70vh] z-20 opacity-0 scale-90 rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_50px_100px_rgba(0,0,0,0.5)]"
      >
        <div className="absolute inset-0 bg-black/40 z-10" />
        <img 
          src="/images/production-visual.png" 
          alt="Production Visual" 
          className="production-image w-full h-full object-cover grayscale transition-all duration-1000"
        />
        
        {/* Overlay Cards while revealed */}
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 md:p-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
                <HeroStats className="stat-card" icon={<Zap />} title="Hyper-Growth" value="50M+" desc="Total organic views generated." />
                <HeroStats className="stat-card" icon={<Star />} title="Elite Quality" value="Top 1%" desc="Industry leading production value." />
                <HeroStats className="stat-card" icon={<MousePointer2 />} title="Retention" value="85%" desc="Average viewer retention rate." />
            </div>
        </div>
      </div>
      
      {/* Scroll Hint */}
      <motion.div 
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] font-black tracking-[0.2em] text-white/30 truncate">SCROLL TO REVEAL</span>
        <div className="w-px h-12 bg-gradient-to-b from-primary to-transparent" />
      </motion.div>
    </section>
  );
}

function HeroStats({ icon, title, value, desc, className }: { icon: React.ReactNode, title: string, value: string, desc: string, className?: string }) {
    return (
        <div className={cn("p-8 rounded-[2.5rem] bg-black/40 backdrop-blur-2xl border border-white/10 hover:border-primary/50 transition-all group flex flex-col items-center text-center", className)}>
            <div className="w-16 h-16 rounded-[1.5rem] bg-primary/10 flex items-center justify-center text-primary mb-8 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                {icon}
            </div>
            <div className="text-4xl md:text-5xl font-black text-white mb-2 tracking-tighter">{value}</div>
            <div className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-4">{title}</div>
            <p className="text-sm text-gray-400 font-medium leading-relaxed">{desc}</p>
        </div>
    )
}
