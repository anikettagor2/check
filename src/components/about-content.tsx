"use client";

import { motion } from "framer-motion";
import { Target, Lightbulb, Quote, ArrowRight } from "lucide-react";
import Image from "next/image";

export function AboutContent() {
  return (
    <div className="bg-black text-white selection:bg-primary selection:text-white">
      {/* Cinematic Narrative Hero */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-6 pt-20 overflow-hidden">
        <div className="absolute inset-0 bg-radial-gradient from-primary/10 via-transparent to-transparent opacity-40" />
        
        <motion.div
            initial={{ opacity: 0, letterSpacing: "1em" }}
            animate={{ opacity: 1, letterSpacing: "0.3em" }}
            transition={{ duration: 1 }}
            className="text-primary font-black text-xs uppercase mb-8"
        >
            The Origin Story
        </motion.div>
        
        <motion.h1 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-[12vw] md:text-[8vw] font-black uppercase leading-[0.85] tracking-tighter mb-12"
        >
            Crafting <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-white to-primary">The Future</span>
        </motion.h1>
        
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="max-w-2xl text-zinc-500 text-xl font-medium leading-relaxed"
        >
            Founded on the belief that video isn't just about pixels—it's about the electrical pulse of human emotion.
        </motion.div>
      </section>

      {/* Philosophy Section */}
      <section className="py-60 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-20 items-center">
              <div className="w-full md:w-1/2 relative aspect-square rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl">
                  <Image 
                    src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2000" 
                    alt="Creative Hub" 
                    fill 
                    className="object-cover opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black via-transparent to-primary/20" />
              </div>
              <div className="w-full md:w-1/2 space-y-12">
                  <div className="space-y-4">
                      <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">The Edito<span className="text-primary">Hub</span> Philosophy</h2>
                      <p className="text-zinc-500 text-xl leading-relaxed font-medium">
                          We recognized that content creators didn't just need cuts and transitions; they needed a partner who understood pace, emotion, and retention. Today, we are that partner for brands worldwide.
                      </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="p-8 rounded-3xl bg-zinc-950 border border-white/5 hover:border-primary/30 transition-all group">
                          <Target className="w-8 h-8 text-primary mb-6 group-hover:scale-110 transition-transform" />
                          <h4 className="text-lg font-black uppercase mb-2">Our Mission</h4>
                          <p className="text-zinc-500 text-sm">Empowering creators with cinematic edge and surgical precision.</p>
                      </div>
                      <div className="p-8 rounded-3xl bg-zinc-950 border border-white/5 hover:border-primary/30 transition-all group">
                          <Lightbulb className="w-8 h-8 text-purple-500 mb-6 group-hover:scale-110 transition-transform" />
                          <h4 className="text-lg font-black uppercase mb-2">Our Vision</h4>
                          <p className="text-zinc-500 text-sm">Setting the global gold standard for remote video production.</p>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* Majestic Founder Section */}
      <section className="py-40 px-6 relative">
          <div className="absolute top-0 right-0 p-64 bg-primary/10 blur-[150px] rounded-full translate-x-1/2 -translate-y-1/2" />
          
          <div className="max-w-7xl mx-auto bg-zinc-950/50 backdrop-blur-3xl rounded-[4rem] border border-white/5 overflow-hidden p-12 md:p-24 flex flex-col lg:flex-row items-center gap-20">
              <div className="w-full lg:w-2/5 relative aspect-[3/4] rounded-[2rem] overflow-hidden group shadow-2xl">
                  <Image 
                    src="/founder.jpg" 
                    alt="Divyanshu Yadav" 
                    fill 
                    className="object-cover object-top group-hover:scale-105 transition-transform duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  <div className="absolute bottom-8 left-8">
                      <h3 className="text-2xl font-black uppercase text-white">Divyanshu Yadav</h3>
                      <p className="text-primary font-bold uppercase tracking-widest text-xs mt-1">Founding Architect</p>
                  </div>
              </div>

              <div className="w-full lg:w-3/5 space-y-10 relative">
                  <Quote className="w-20 h-20 text-primary opacity-10 absolute -top-10 -left-10" />
                  <div className="space-y-6">
                      <h2 className="text-4xl md:text-6xl font-black uppercase leading-tight tracking-tighter">
                          "Editing is where the <span className="text-primary italic">Soul</span> enters the frame."
                      </h2>
                      <p className="text-zinc-400 text-xl leading-relaxed font-medium italic">
                          At EditoHub, we don't just edit videos; we engineer experiences. In a world of infinite scrolling, we create the moment that makes the world stop and watch.
                      </p>
                  </div>

                  <div className="flex flex-wrap gap-6 items-center">
                      <button className="flex items-center gap-3 px-8 py-4 bg-primary text-white text-[11px] font-black uppercase tracking-widest rounded-full hover:brightness-110 transition-all shadow-xl shadow-primary/20">
                          Founder's Story <ArrowRight className="h-4 w-4" />
                      </button>
                      <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 cursor-pointer transition-all">
                            <span className="text-[10px] font-bold">In</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 cursor-pointer transition-all">
                            <span className="text-[10px] font-bold">X</span>
                        </div>
                      </div>
                  </div>
              </div>
          </div>
      </section>
    </div>
  );
}
