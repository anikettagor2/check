"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import Image from "next/image";

export function BeforeAfter() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const revealRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
            // Horizontal reveal effect
            gsap.to(revealRef.current, {
                width: "100%",
                ease: "none",
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top top",
                    end: "+=150%",
                    scrub: true,
                    pin: true,
                }
            });

            // Handle bar animation
            gsap.to(barRef.current, {
                left: "100%",
                ease: "none",
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top top",
                    end: "+=150%",
                    scrub: true,
                }
            });
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section ref={sectionRef} className="relative h-screen bg-black overflow-hidden">
            {/* Background Narrative */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <h2 className="text-[20vw] font-black uppercase text-white leading-none tracking-tighter">TRANSFORM</h2>
            </div>

            <div className="relative w-full h-full flex items-center justify-center px-10">
                <div ref={containerRef} className="relative aspect-video w-full max-w-6xl rounded-[2rem] overflow-hidden border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                    
                    {/* Before Image (Bottom Layer) */}
                    <div className="absolute inset-0 grayscale brightness-50">
                        <Image 
                            src="https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2000" 
                            alt="Original Footage" 
                            fill 
                            className="object-cover"
                        />
                        <div className="absolute top-10 left-10 p-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Raw Source</span>
                        </div>
                    </div>

                    {/* After Image (Top Layer) */}
                    <div ref={revealRef} className="absolute inset-0 z-10 w-0 overflow-hidden border-r-[1px] border-primary/50 shadow-[10px_0_50px_rgba(99,102,241,0.3)]">
                        <div className="absolute inset-0 w-[100vw] max-w-6xl aspect-video">
                            <Image 
                                src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=2000" 
                                alt="Final Edit" 
                                fill 
                                className="object-cover"
                            />
                            <div className="absolute bottom-10 right-10 p-4 rounded-2xl bg-primary/20 backdrop-blur-md border border-primary/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Cinematic Output</span>
                            </div>
                        </div>
                    </div>

                    {/* Progress Marker */}
                    <div ref={barRef} className="absolute top-0 bottom-0 left-0 w-[2px] bg-primary z-20 pointer-events-none shadow-[0_0_15px_rgba(99,102,241,0.8)]">
                        <div className="absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-2xl">
                            <div className="flex gap-0.5">
                                <div className="w-[1px] h-3 bg-white/50" />
                                <div className="w-[1px] h-3 bg-white/50" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
