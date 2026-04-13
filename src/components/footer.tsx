"use client";

import Link from "next/link";
import Image from "next/image";
import { Twitter, Instagram, Linkedin, Youtube, MapPin } from "lucide-react";
import { useBranding } from "@/lib/context/branding-context";

export function Footer() {
  const { logoUrl } = useBranding();
  
  return (
    <footer className="border-t border-black/10 bg-[#fbfaf7] py-16">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-6 premium-light-surface rounded-2xl p-6">
            <Link href="/" className="block relative h-12 w-48 mb-2 rounded-xl overflow-hidden">
               {logoUrl ? (
                 <Image 
                    src={logoUrl} 
                    alt="EditoHub Logo" 
                    fill 
                    className="object-contain object-left"
                 />
               ) : (
                 <div className="relative h-12 w-48 flex items-center">
                   <Image 
                      src="/logo.png" 
                      alt="EditoHub Logo" 
                      fill 
                      className="object-contain object-left"
                      priority
                   />
                 </div>
               )}
            </Link>
            <p className="text-muted-foreground leading-relaxed text-sm">
              We turn raw footage into cinematic stories. The premium choice for top-tier creators and brands aiming for viral impact.
            </p>
            <div className="flex space-x-4 pt-4">
              <SocialIcon href="#" icon={<Twitter className="w-4 h-4" />} />
              <SocialIcon href="#" icon={<Instagram className="w-4 h-4" />} />
              <SocialIcon href="#" icon={<Linkedin className="w-4 h-4" />} />
              <SocialIcon href="#" icon={<Youtube className="w-4 h-4" />} />
            </div>
          </div>

          {/* Visit Us */}
          <div>
            <h3 className="font-semibold text-lg mb-6">Visit Us</h3>
            <div className="flex items-start space-x-3 text-muted-foreground text-sm leading-relaxed">
              <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p>
                01, Divyanshu Bhavan, <br />
                Basarikhpur, Sisotar, <br />
                Maniyar Road, Sikander Pur, <br />
                Uttar Pradesh, Ballia, <br />
                Pin 277303
              </p>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold text-lg mb-6">Services</h3>
            <ul className="space-y-4">
              <FooterLink href="/services">Short-form Video</FooterLink>
              <FooterLink href="/services">Scriptwriting</FooterLink>
              <FooterLink href="/services">Thumbnail Design</FooterLink>
              <FooterLink href="/services">Bulk Video Editing</FooterLink>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-lg mb-6">Company</h3>
            <ul className="space-y-4">
              <FooterLink href="/about">About Us</FooterLink>
              <FooterLink href="/portfolio">Portfolio</FooterLink>
              <FooterLink href="#">Careers</FooterLink>
              <FooterLink href="#">Contact</FooterLink>
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-black/10 flex flex-col md:flex-row items-center justify-between text-sm text-muted-foreground premium-light-surface rounded-2xl px-5 py-4">
          <p>© {new Date().getFullYear()} EditoHub. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({ href, icon }: { href: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-white transition-all duration-300"
    >
      {icon}
    </Link>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-muted-foreground hover:text-primary transition-colors text-sm">
        {children}
      </Link>
    </li>
  );
}
