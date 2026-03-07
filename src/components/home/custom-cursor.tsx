"use client";

import React, { useEffect, useState } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";

export function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [cursorType, setCursorType] = useState<"default" | "pointer" | "text" | "hidden">("default");
  const [hoverData, setHoverData] = useState<string | null>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 200, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);

      const target = e.target as HTMLElement;
      const isPointer = window.getComputedStyle(target).cursor === "pointer";
      const isText = ["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6"].includes(target.tagName) || target.closest(".text-interactive");
      
      if (isPointer) setCursorType("pointer");
      else if (isText) setCursorType("text");
      else setCursorType("default");

      const hoverAction = target.closest("[data-cursor-text]")?.getAttribute("data-cursor-text");
      setHoverData(hoverAction || null);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mouseX, mouseY]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] hidden md:block">
      {/* Main Ring */}
      <motion.div
        className="absolute w-8 h-8 border border-primary/50 rounded-full"
        style={{
          x: cursorX,
          y: cursorY,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          scale: isClicking ? 0.8 : cursorType === "pointer" ? 1.5 : 1,
          opacity: 1,
        }}
      />

      {/* Center Dot */}
      <motion.div
        className="absolute w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)]"
        style={{
          x: mouseX,
          y: mouseY,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          scale: isClicking ? 1.5 : cursorType === "pointer" ? 0 : 1,
        }}
      />

      {/* Hover Text */}
      {hoverData && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full"
          style={{
            x: mouseX,
            y: mouseY,
            translateX: "20px",
            translateY: "-20px",
          }}
        >
          {hoverData}
        </motion.div>
      )}

      {/* Large Backdrop for Text */}
      {cursorType === "text" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          className="absolute w-12 h-12 bg-white rounded-full blur-2xl"
          style={{
            x: mouseX,
            y: mouseY,
            translateX: "-50%",
            translateY: "-50%",
          }}
        />
      )}
    </div>
  );
}
