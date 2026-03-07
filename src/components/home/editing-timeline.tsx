"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { Play, Scissors, Layers, Volume2, Type } from "lucide-react";

export function EditingTimeline() {
    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
            // Pin the timeline section
            ScrollTrigger.create({
                trigger: containerRef.current,
                start: "top top",
                end: "+=200%",
                pin: true,
                scrub: 1,
            });

            // Animate playhead
            gsap.to(playheadRef.current, {
                left: "100%",
                ease: "none",
                scrollTrigger: {
                    trigger: containerRef.current,
                    start: "top top",
                    end: "+=200%",
                    scrub: 0.5,
                }
            });

            // Animate clips appearing and interlocking
            gsap.from(".timeline-clip", {
                x: (i) => (i % 2 === 0 ? -100 : 100),
                opacity: 0,
                stagger: 0.1,
                scrollTrigger: {
                    trigger: containerRef.current,
                    start: "top 80%",
                    end: "top 20%",
                    scrub: 1,
                }
            });

            // Floating 3D elements
            gsap.to(".floating-tool", {
                y: -20,
                duration: 2,
                repeat: -1,
                yoyo: true,
                stagger: 0.2,
                ease: "power1.inOut"
            });
        }, containerRef);

        return () => ctx.revert();
    }, []);

    return (
        <section ref={containerRef} className="relative h-screen bg-black overflow-hidden flex flex-col justify-center px-10">
            {/* Ambient Background Lights */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full" />
            <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/10 blur-[150px] rounded-full" />

            <div className="relative z-10 max-w-7xl mx-auto w-full">
                <div className="premium-header mb-2 text-primary">Process 03</div>
                <h2 className="text-4xl md:text-6xl font-black uppercase text-white mb-12 tracking-tighter">
                   The <span className="text-primary italic">Timeline</span> Interface
                </h2>

                {/* Simulated Editor Workspace */}
                <div className="relative bg-zinc-900/50 backdrop-blur-2xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    {/* Toolbar */}
                    <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-zinc-900/80">
                        <Play className="w-4 h-4 text-primary fill-current" />
                        <div className="h-4 w-[1px] bg-zinc-800 mx-2" />
                        <div className="flex gap-4">
                            <Scissors className="floating-tool w-4 h-4 text-zinc-400" />
                            <Layers className="floating-tool w-4 h-4 text-zinc-400" />
                            <Volume2 className="floating-tool w-4 h-4 text-zinc-400" />
                            <Type className="floating-tool w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="ml-auto text-[10px] font-mono text-zinc-500">00:04:12:15</div>
                    </div>

                    {/* Timeline Tracks */}
                    <div ref={timelineRef} className="p-8 space-y-4 relative min-h-[300px]">
                        {/* Playhead */}
                        <div ref={playheadRef} className="absolute top-0 bottom-0 w-[2px] bg-primary z-20 left-0 shadow-[0_0_15px_rgba(99,102,241,0.8)]">
                            <div className="absolute -top-1 -left-1.5 w-4 h-4 bg-primary rotate-45" />
                        </div>

                        {/* Track 1 (Video) */}
                        <div className="h-20 bg-zinc-800/30 rounded-xl relative overflow-hidden border border-white/5">
                            <div className="absolute left-[10%] w-[30%] h-full bg-primary/20 border-x border-primary/40 timeline-clip flex items-center px-4">
                                <span className="text-[10px] font-bold text-primary uppercase">Main_Sequence_01</span>
                            </div>
                            <div className="absolute left-[40.5%] w-[25%] h-full bg-primary/40 border-x border-primary/60 timeline-clip flex items-center px-4 backdrop-blur-sm">
                                <span className="text-[10px] font-bold text-white uppercase">Transition_B_Roll</span>
                            </div>
                            <div className="absolute left-[66%] w-[20%] h-full bg-primary/20 border-x border-primary/40 timeline-clip flex items-center px-4">
                                <span className="text-[10px] font-bold text-primary uppercase">Closing_Shot</span>
                            </div>
                        </div>

                        {/* Track 2 (Overlay/GFX) */}
                        <div className="h-12 bg-zinc-800/30 rounded-xl relative overflow-hidden border border-white/5">
                            <div className="absolute left-[15%] w-[10%] h-full bg-purple-500/20 border-x border-purple-500/40 timeline-clip" />
                            <div className="absolute left-[45%] w-[15%] h-full bg-purple-500/20 border-x border-purple-500/40 timeline-clip" />
                        </div>

                        {/* Track 3 (Audio) */}
                        <div className="h-16 bg-zinc-800/30 rounded-xl relative overflow-hidden border border-white/5">
                            <div className="absolute left-[0%] w-[100%] h-full px-2 flex items-center gap-1 opacity-20">
                                {[40, 70, 45, 90, 65, 30, 85, 50, 75, 40, 95, 60, 35, 80, 55, 90, 45, 70, 30, 85, 60, 40, 95, 50, 75, 35, 80, 45, 90, 60].map((height, i) => (
                                    <div key={i} className="flex-1 bg-zinc-500" style={{ height: `${height}%` }} />
                                ))}
                            </div>
                            <div className="absolute left-[5%] w-[40%] h-full bg-blue-500/20 border-x border-blue-500/40 timeline-clip" />
                            <div className="absolute left-[50%] w-[45%] h-full bg-blue-500/20 border-x border-blue-500/40 timeline-clip" />
                        </div>
                    </div>
                </div>

                {/* Narrative Text */}
                <div className="mt-12 max-w-2xl">
                    <p className="text-zinc-500 text-xl leading-relaxed">
                        We don't just put clips together. We architect stories frame by frame, managing complex timelines to ensure every beat hits with mathematical precision.
                    </p>
                </div>
            </div>
        </section>
    );
}
