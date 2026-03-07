"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";

export function Hero() {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);
        
        // Video Zoom on Scroll
        gsap.to(videoRef.current, {
            scale: 1.2,
            opacity: 0.3,
            scrollTrigger: {
                trigger: containerRef.current,
                start: "top top",
                end: "bottom top",
                scrub: true
            }
        });

        // Mouse Parallax Effect
        const handleMouseMove = (e: MouseEvent) => {
            const { clientX, clientY } = e;
            const xPos = (clientX / window.innerWidth - 0.5) * 40;
            const yPos = (clientY / window.innerHeight - 0.5) * 40;

            gsap.to(contentRef.current, {
                x: xPos,
                y: yPos,
                duration: 1,
                ease: "power2.out"
            });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    const words = "Elevate Your Visual Story".split(" ");

    return (
        <section ref={containerRef} className="relative h-screen w-full flex items-center justify-center overflow-hidden bg-black">
            {/* Cinematic Background Video */}
            <div className="absolute inset-0 z-0 scale-110">
                <video 
                    ref={videoRef}
                    autoPlay 
                    muted 
                    loop 
                    playsInline
                    className="w-full h-full object-cover brightness-[0.4]"
                >
                    <source src="https://assets.mixkit.co/videos/preview/mixkit-cinematic-night-sky-over-mountains-34241-large.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black z-10" />
            </div>

            <div ref={contentRef} className="relative z-20 text-center px-6 pointer-events-none">
                <div className="overflow-hidden">
                    <motion.span 
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        transition={{ duration: 1, ease: "circOut" }}
                        className="text-primary font-black tracking-[0.5em] uppercase text-[10px] md:text-xs mb-6 block"
                    >
                        Immersive Post-Production
                    </motion.span>
                </div>

                <h1 className="text-6xl md:text-[10vw] font-black tracking-tighter uppercase text-white leading-[0.85] flex flex-wrap justify-center gap-x-6">
                    {words.map((word, i) => (
                        <div key={i} className="overflow-hidden">
                            <motion.span
                                initial={{ y: "100%", rotate: 5 }}
                                animate={{ y: 0, rotate: 0 }}
                                transition={{ duration: 1, delay: i * 0.1 + 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className={`inline-block ${word === "Visual" ? "text-primary italic font-serif" : ""}`}
                            >
                                {word}
                            </motion.span>
                        </div>
                    ))}
                </h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.5, delay: 1.5 }}
                    className="mt-12 text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto font-medium tracking-tight"
                >
                    We engineer cinematic narratives. Every frame is a decision. Every cut is a heartbeat. Experience Awwwards-level post-production.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, delay: 2 }}
                    className="mt-16 pointer-events-auto"
                >
                    <button className="group relative px-12 py-6 overflow-hidden">
                        <span className="relative z-10 text-white font-black uppercase text-xs tracking-[0.3em]">Launch Studio</span>
                        <div className="absolute inset-0 bg-primary translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500 ease-expo" />
                        <div className="absolute inset-0 border border-white/20" />
                    </button>
                </motion.div>
            </div>

            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
                <div className="w-[1px] h-24 bg-gradient-to-b from-primary/50 to-transparent relative">
                    <motion.div 
                        animate={{ y: [0, 48, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-0 left-[-2px] w-[5px] h-[5px] bg-primary rounded-full shadow-[0_0_10px_#6366f1]"
                    />
                </div>
            </div>
        </section>
    );
}
