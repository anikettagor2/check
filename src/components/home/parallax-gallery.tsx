"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const GALLERY_IMAGES = [
    { url: "https://images.unsplash.com/photo-1542204172-3c1f81d05d70?q=80&w=2000", size: "col-span-1 row-span-2", speed: 0.1 },
    { url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2000", size: "col-span-1 row-span-1", speed: 0.2 },
    { url: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?q=80&w=2000", size: "col-span-2 row-span-1", speed: -0.15 },
    { url: "https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2000", size: "col-span-1 row-span-1", speed: 0.3 },
    { url: "https://images.unsplash.com/photo-1485846234645-a62644ef7467?q=80&w=2000", size: "col-span-1 row-span-2", speed: -0.25 },
];

function TiltCard({ img, i }: { img: any, i: number }) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;
        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={`parallax-item relative overflow-hidden rounded-[2rem] border border-white/5 bg-zinc-900 ${img.size} min-h-[300px] md:min-h-[400px] group transition-shadow duration-500 hover:shadow-[0_0_50px_rgba(99,102,241,0.2)]`}
        >
            <div style={{ transform: "translateZ(50px)" }} className="absolute inset-0">
                <Image 
                    src={img.url} 
                    alt={`Work ${i}`} 
                    fill 
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    sizes="(max-width: 768px) 100vw, 33vw"
                />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 z-10" />
            <div style={{ transform: "translateZ(75px)" }} className="absolute bottom-10 left-10 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <span className="text-white font-black uppercase text-xs tracking-widest">Project 0{i+1}</span>
            </div>
        </motion.div>
    );
}

export function ParallaxGallery() {
    const sectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
            gsap.utils.toArray(".parallax-item").forEach((item: any) => {
                const speed = parseFloat(item.dataset.speed || "0.1");
                gsap.fromTo(item, 
                    { y: "50px" },
                    {
                        y: "-150px",
                        ease: "none",
                        scrollTrigger: {
                            trigger: item,
                            start: "top bottom",
                            end: "bottom top",
                            scrub: true
                        }
                    }
                );
            });
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section ref={sectionRef} className="bg-black py-40 px-6 overflow-hidden">
            <div className="max-w-7xl mx-auto space-y-32">
                <div className="text-center">
                    <div className="premium-header text-primary">Portfolio</div>
                    <h2 className="text-6xl md:text-9xl font-black uppercase tracking-tighter text-white mb-8">
                        Visual <span className="text-primary italic">Vault</span>
                    </h2>
                    <p className="text-zinc-500 max-w-xl mx-auto text-xl font-medium tracking-tight">
                        A curated archive of high-impact cinematic narratives crafted with surgical precision.
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 automotive-grid">
                    {GALLERY_IMAGES.map((img, i) => (
                        <TiltCard key={i} img={img} i={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
