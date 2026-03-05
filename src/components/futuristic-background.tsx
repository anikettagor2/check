"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";

export function FuturisticBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const xPos = (clientX / window.innerWidth - 0.5) * 20;
      const yPos = (clientY / window.innerHeight - 0.5) * 20;

      gsap.to(containerRef.current, {
        "--x": `${clientX}px`,
        "--y": `${clientY}px`,
        duration: 0.5,
      });

      gsap.to(gridRef.current, {
        x: xPos,
        y: yPos,
        duration: 1,
        ease: "power2.out",
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-0 bg-[#0F1115] overflow-hidden pointer-events-none"
      style={{
        "--x": "50%",
        "--y": "50%",
      } as React.CSSProperties}
    >
      {/* Radial Gradient Glow that follows mouse */}
      <div className="absolute inset-0 z-0 opacity-40 bg-[radial-gradient(circle_at_var(--x)_var(--y),_var(--primary)_0%,_transparent_50%)] blur-[100px]" />
      
      {/* Animated Grid */}
      <div 
        ref={gridRef}
        className="absolute inset-[-10%] z-0 opacity-20"
        style={{
          backgroundImage: `linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Deep Space Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e1b4b_0%,_transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_#312e81_0%,_transparent_50%)]" />
    </div>
  );
}
