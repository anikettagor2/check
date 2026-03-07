"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import Image from "next/image";

const STICKY_MOCK_DATA = [
    {
        title: "Precision Cutting",
        description: "Every frame matters. Our editors meticulously craft each transition to maintain rhythm and flow, ensuring your message is delivered with maximum impact.",
        image: "https://images.unsplash.com/photo-1542204172-3c1f81d05d70?q=80&w=2000"
    },
    {
        title: "Color Science",
        description: "Transform the mood and atmosphere of your visuals. We apply cinematic color science to give your footage a professional, high-end look that stands out.",
        image: "https://images.unsplash.com/photo-1621609764095-b32bbe35cf3a?q=80&w=2000"
    },
    {
        title: "Auditory Immersive",
        description: "The visual is only half the story. We layer bespoke soundscapes and precise audio engineering to create an immersive auditory experience.",
        image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=2000"
    }
];

export function StickyScroll() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const pinRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
            const items = gsap.utils.toArray<HTMLElement>(".sticky-content-item");
            const images = gsap.utils.toArray<HTMLElement>(".sticky-image-item");

            // Pin the right side media box
            ScrollTrigger.create({
                trigger: sectionRef.current,
                start: "top top",
                end: "bottom bottom",
                pin: pinRef.current,
                pinSpacing: false,
            });

            // Handle image transitions and text active states
            items.forEach((item, i) => {
                const img = images[i];
                
                ScrollTrigger.create({
                    trigger: item,
                    start: "top 40%",
                    end: "bottom 40%",
                    onToggle: (self) => {
                        if (self.isActive) {
                            // Active Image
                            gsap.to(img, { 
                                opacity: 1, 
                                scale: 1,
                                zIndex: 10,
                                duration: 0.6, 
                                ease: "power2.out",
                                overwrite: "auto"
                            });
                            // Active Text Highlight
                            gsap.to(item, { opacity: 1, x: 20, duration: 0.4 });
                        } else {
                            // Inactive Image
                            gsap.to(img, { 
                                opacity: 0, 
                                scale: 1.05,
                                zIndex: 0,
                                duration: 0.6, 
                                ease: "power2.out",
                                overwrite: "auto"
                            });
                            // Inactive Text
                            gsap.to(item, { opacity: 0.3, x: 0, duration: 0.4 });
                        }
                    }
                });
            });

            // Initial state for non-first items
            gsap.set(items.slice(1), { opacity: 0.3 });
            gsap.set(images.slice(1), { opacity: 0, scale: 1.05 });
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section ref={sectionRef} className="relative bg-black py-40 px-6 overflow-hidden">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start gap-12 lg:gap-24">
                
                {/* Left Side: Scrolling Content */}
                <div className="w-full md:w-1/2 space-y-[40vh] py-[20vh]">
                    {STICKY_MOCK_DATA.map((item, i) => (
                        <div key={i} className="sticky-content-item transition-all duration-500">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="h-[1px] w-12 bg-primary/50" />
                                <span className="text-primary font-black text-xs tracking-[0.3em] uppercase">Phase 0{i + 1}</span>
                            </div>
                            <h2 className="text-6xl md:text-8xl font-black uppercase text-white mb-10 tracking-tighter leading-[0.85]">
                                {item.title.split(' ').map((word, idx) => (
                                    <span key={idx} className={idx % 2 !== 0 ? "text-primary italic" : "block"}>{word} </span>
                                ))}
                            </h2>
                            <p className="text-zinc-500 text-xl md:text-2xl max-w-xl leading-relaxed font-medium tracking-tight">
                                {item.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Right Side: Pinned Media Container */}
                <div className="hidden md:block w-1/2 h-screen flex items-center">
                    <div ref={pinRef} className="relative w-full aspect-square max-h-[70vh] rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)] bg-zinc-900 group">
                        <div className="absolute inset-0 z-20 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                        
                        {STICKY_MOCK_DATA.map((item, i) => (
                            <div key={i} className="sticky-image-item absolute inset-0 w-full h-full">
                                <Image 
                                    src={item.image} 
                                    alt={item.title} 
                                    fill 
                                    priority={i === 0}
                                    className="object-cover transition-transform duration-1000"
                                />
                            </div>
                        ))}

                        {/* Visual Decorative Elements */}
                        <div className="absolute top-8 left-8 z-30 flex gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            <div className="w-20 h-[1px] bg-white/20 mt-[3px]" />
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
}
