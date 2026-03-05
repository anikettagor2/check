"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/context/auth-context";
import { useBranding } from "@/lib/context/branding-context";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { logoUrl } = useBranding();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "Services", href: "/#services" },
    { name: "Work", href: "/#work" },
  ];

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-white/5 h-16"
          : "bg-transparent h-24"
      )}
    >
      <div className="container mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="hover:opacity-80 transition-opacity"
        >
          <div className="relative h-14 w-48 flex items-center">
             {logoUrl ? (
               <Image 
                  src={logoUrl} 
                  alt="EditoHub Logo" 
                  fill 
                  className="object-contain object-left scale-110"
                  priority
               />
             ) : (
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-[1rem] bg-primary flex items-center justify-center font-black text-black italic text-xl shadow-[0_0_20px_rgba(99,102,241,0.3)]">EH</div>
                    <span className="text-2xl font-black tracking-tighter hidden sm:block">EDITO_HUB</span>
                </div>
             )}
          </div>
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary relative group",
                pathname === link.href ? "text-primary" : "text-muted-foreground"
              )}
            >
              {link.name}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/dashboard/settings">
                <Button size="sm" variant="ghost">
                  Settings
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="sm" variant="ghost">
                  Dashboard
                </Button>
              </Link>
              <Button size="sm" variant="default" onClick={() => logout()}>
                Logout
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm" variant="default">
                Get Started
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile Toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-white focus:outline-none p-2"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "100vh" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background absolute top-full left-0 right-0 border-t border-white/10 overflow-hidden"
          >
            <div className="flex flex-col p-6 space-y-6 items-center justify-center h-full pb-32">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="text-2xl font-medium hover:text-primary transition-colors"
                >
                  {link.name}
                </Link>
              ))}
              {user ? (
                 <>
                  <Link href="/dashboard/settings" onClick={() => setIsOpen(false)} className="text-2xl font-medium hover:text-primary transition-colors">
                    Settings
                  </Link>
                  <Link href="/dashboard" onClick={() => setIsOpen(false)} className="text-2xl font-medium hover:text-primary transition-colors">
                    Dashboard
                  </Link>
                  <Button size="lg" className="w-full max-w-xs mt-4" onClick={() => { setIsOpen(false); logout(); }}>
                    Logout
                  </Button>
                 </>
              ) : (
                <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button size="lg" className="w-full max-w-xs mt-4">
                        Get Started
                    </Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
