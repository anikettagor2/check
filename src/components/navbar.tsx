"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/context/auth-context";
import { useBranding } from "@/lib/context/branding-context";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { logoUrl } = useBranding();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "Services", href: "/services" },
    { name: "Portfolio", href: "/portfolio" },
  ];

  return (
    <>
      {/* Floating Pill Navbar */}
      <div className="fixed top-8 left-0 right-0 z-[100] flex justify-center px-6 pointer-events-none">
        <motion.nav
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={cn(
            "pointer-events-auto flex items-center gap-8 px-8 py-3 rounded-full border border-white/10 bg-black/40 backdrop-blur-2xl transition-all duration-500 hover:bg-black/60",
            scrolled ? "shadow-[0_20px_40px_rgba(0,0,0,0.4)] border-white/20" : "bg-transparent border-transparent"
          )}
        >
          {/* Logo Section */}
          <Link href="/" className="flex items-center gap-2 group mr-4">
             {logoUrl ? (
               <div className="relative h-6 w-24">
                 <Image src={logoUrl} alt="Logo" fill className="object-contain" />
               </div>
             ) : (
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-[12px] text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]">E</div>
                    <span className="text-[10px] font-black tracking-[0.2em] text-white uppercase group-hover:text-primary transition-colors">Edito<span className="italic text-primary">Hub</span></span>
                </div>
             )}
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8 h-full">
            {navLinks.map((link) => (
              <div key={link.name} className="relative group h-full flex items-center">
                <Link
                  href={link.href}
                  className={cn(
                    "text-[9px] font-black uppercase tracking-[0.2em] transition-all hover:text-primary py-4",
                    pathname === link.href ? "text-primary" : "text-zinc-400"
                  )}
                >
                  {link.name}
                </Link>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 ml-4">
            {user ? (
              <Link href="/dashboard">
                <button className="flex items-center gap-2 px-5 py-2 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-primary hover:text-white transition-all">
                  Dashboard <ArrowUpRight className="h-3 w-3" />
                </button>
              </Link>
            ) : (
              <Link href="/login">
                 <button className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:brightness-110 transition-all">
                  Ignite <ArrowUpRight className="h-3 w-3" />
                </button>
              </Link>
            )}
            
            {/* Mobile Menu Trigger */}
            <button 
              onClick={() => setIsOpen(true)}
              className="md:hidden text-white p-1"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </motion.nav>
      </div>

      {/* Modern Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[200] md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[80%] bg-zinc-950 z-[210] p-12 flex flex-col md:hidden border-l border-white/5"
            >
              <button 
                onClick={() => setIsOpen(false)}
                className="self-end h-12 w-12 rounded-full border border-white/10 flex items-center justify-center text-white mb-20"
              >
                <X className="h-6 w-6" />
              </button>

              <div className="space-y-10">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="block text-4xl font-black uppercase tracking-tighter text-zinc-500 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                ))}
              </div>

              <div className="mt-auto">
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  <button className="w-full py-6 bg-primary text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-2xl shadow-primary/20">
                    Get Started Now
                  </button>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SubNavLink({ title, desc }: { title: string, desc: string }) {
  return (
    <Link href="/#services" className="group/sub flex flex-col gap-1.5 p-3 rounded-xl hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-300 group-hover/sub:text-primary transition-colors">{title}</span>
        <div className="h-5 w-5 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover/sub:opacity-100 transition-all">
          <ArrowUpRight className="h-3 w-3 text-primary" />
        </div>
      </div>
      <span className="text-[9px] text-zinc-500 font-medium leading-relaxed group-hover/sub:text-zinc-400 transition-colors">{desc}</span>
    </Link>
  );
}
