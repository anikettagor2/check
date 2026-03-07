"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";

function ScrollText() {
    const textRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);
        
        const chars = textRef.current?.querySelectorAll(".char");
        if (chars) {
            gsap.fromTo(chars, 
                { opacity: 0.1 },
                {
                    opacity: 1,
                    stagger: 0.1,
                    scrollTrigger: {
                        trigger: textRef.current,
                        start: "top 80%",
                        end: "bottom 20%",
                        scrub: true,
                    }
                }
            );
        }
    }, []);

    const text = "We create cinematic visuals that don't just tell a story—they create an obsession. From high-fashion commercials to high-stakes gaming reels, our methodology remains consistent: Absolute Precision.";

    return (
        <section className="bg-black py-60 px-6">
            <div ref={textRef} className="max-w-5xl mx-auto">
                <p className="text-3xl md:text-6xl font-black uppercase tracking-tighter text-white leading-[1.1]">
                    {text.split(" ").map((word, i) => (
                        <span key={i} className="char inline-block mr-[0.3em]">{word}</span>
                    ))}
                </p>
            </div>
        </section>
    );
}

export { ScrollText };
