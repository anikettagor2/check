"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    number: "01",
    title: "Strategy & Onboarding",
    description: "We deep dive into your content style, goals, and target audience to build a custom editing blueprint."
  },
  {
    number: "02",
    title: "Raw Footage Transfer",
    description: "Upload your raw files to our high-speed cloud infrastructure. We handle massive files with ease."
  },
  {
    number: "03",
    title: "Elite Production Phase",
    description: "Our specialist editors craft your content using cinematic techniques and viral psychology."
  },
  {
    number: "04",
    title: "Review & Refine",
    description: "Use our frame-accurate feedback tool to request adjustments. We refine until it's perfect."
  },
  {
    number: "05",
    title: "Master Delivery",
    description: "Receive your high-bitrate masters ready for platform domination."
  }
];

export function FuturisticProcess() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !lineRef.current) return;

    // Animate the vertical line as we scroll
    gsap.fromTo(lineRef.current, 
      { scaleY: 0 },
      {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 20%",
          end: "bottom 80%",
          scrub: true,
        }
      }
    );

    // Stagger the items appearing
    const items = gsap.utils.toArray(".process-item");
    items.forEach((item: any, i) => {
        gsap.fromTo(item, 
            { opacity: 0, x: i % 2 === 0 ? -50 : 50 },
            {
                opacity: 1,
                x: 0,
                scrollTrigger: {
                    trigger: item,
                    start: "top 80%",
                    end: "top 50%",
                    scrub: true,
                }
            }
        );
    });

    return () => ScrollTrigger.getAll().forEach(t => t.kill());
  }, []);

  return (
    <section ref={containerRef} className="py-32 relative bg-transparent z-10 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-32 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-primary font-black tracking-[0.4em] uppercase text-xs mb-4"
          >
            The Workflow
          </motion.div>
          <h2 className="text-4xl md:text-7xl font-black mb-6 tracking-tighter uppercase text-white">
            Our <span className="text-primary italic">Process</span>
          </h2>
        </div>

        <div className="relative max-w-4xl mx-auto">
          {/* Vertical Progress Line */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-white/10 hidden md:block">
            <div ref={lineRef} className="w-full h-full bg-primary origin-top" />
          </div>

          <div className="space-y-24 md:space-y-40">
            {steps.map((step, index) => (
              <div key={index} className={`process-item flex flex-col md:flex-row items-center gap-12 ${index % 2 === 0 ? "md:flex-row-reverse" : ""}`}>
                <div className={`flex-1 ${index % 2 === 0 ? "text-left md:text-left" : "text-left md:text-right"}`}>
                   <div className="inline-block text-8xl md:text-9xl font-black text-white/5 tracking-tighter mb-4 leading-none">
                     {step.number}
                   </div>
                   <h3 className="text-2xl md:text-4xl font-black text-white mb-6 uppercase tracking-tight">{step.title}</h3>
                   <p className="text-gray-400 text-lg md:text-xl font-medium leading-relaxed max-w-md mx-auto md:mx-0">
                     {step.description}
                   </p>
                </div>
                
                {/* Visual Dot on the line */}
                <div className="relative z-10 hidden md:flex items-center justify-center w-12 h-12 rounded-full bg-[#0F1115] border border-white/20">
                   <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_15px_var(--primary)]" />
                </div>

                <div className="flex-1 hidden md:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
