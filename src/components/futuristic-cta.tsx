"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "./ui/button";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import gsap from "gsap";

export function FuturisticCTA() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!glowRef.current) return;
    gsap.to(glowRef.current, {
      scale: 1.5,
      opacity: 0.4,
      duration: 4,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  }, []);

  return (
    <section className="py-24 md:py-40 relative overflow-hidden bg-transparent z-10">
      <div className="max-w-[1400px] mx-auto px-6 relative flex flex-col items-center">
        {/* The Card */}
        <div className="relative w-full max-w-5xl rounded-[3rem] p-10 md:p-24 overflow-hidden border border-white/10 bg-white/[0.02] backdrop-blur-3xl text-center flex flex-col items-center">
          
          {/* Animated Glow */}
          <div 
            ref={glowRef}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-primary/20 rounded-full blur-[120px] pointer-events-none z-0" 
          />
          
          <div className="relative z-10 w-full flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 text-primary font-black tracking-[0.4em] uppercase mb-10 text-xs"
            >
              <Sparkles className="w-4 h-4 fill-primary" />
              JOIN THE ELITE
            </motion.div>

            <h2 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-10 leading-[0.9] text-white">
              Ready to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-400 italic">Ascend?</span>
            </h2>

            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-16 leading-relaxed font-medium text-center">
              We only partner with creators who are ready to dominate. Limited slots available for monthly production.
            </p>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link href="/login">
                <Button size="lg" className="h-20 px-12 rounded-2xl text-xl font-black bg-primary hover:bg-primary/90 text-white shadow-[0_20px_60px_rgba(99,102,241,0.3)] transition-all flex items-center gap-4">
                  START YOUR PROJECT
                  <ArrowRight className="w-6 h-6" />
                </Button>
              </Link>
            </motion.div>

            <div className="mt-20 pt-16 border-t border-white/5 w-full grid grid-cols-2 md:grid-cols-4 gap-8">
                <CTAStat label="Happy Clients" value="500+" />
                <CTAStat label="Videos Edited" value="10k+" />
                <CTAStat label="Views Gained" value="1B+" />
                <CTAStat label="Growth Rate" value="300%" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTAStat({ label, value }: { label: string, value: string }) {
    return (
        <div className="flex flex-col items-center">
            <div className="text-2xl md:text-4xl font-black text-white mb-1 tracking-tighter">{value}</div>
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-gray-500">{label}</div>
        </div>
    )
}
