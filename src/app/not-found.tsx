"use client";

import Link from "next/link";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="max-w-lg w-full text-center">
        {/* 404 Number */}
        <div className="mb-8">
          <span className="text-8xl md:text-9xl font-bold text-primary/20">404</span>
        </div>
        
        <h1 className="text-3xl font-bold text-foreground mb-4">
          Page not found
        </h1>
        
        <p className="text-muted-foreground mb-8 text-lg">
          Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/">
            <button className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors font-medium w-full sm:w-auto">
              <Home className="w-5 h-5" />
              Go Home
            </button>
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-colors font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Go Back
          </button>
        </div>
        
        {/* Quick Links */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground mb-4">Popular pages:</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/services" className="text-sm text-primary hover:underline">
              Services
            </Link>
            <Link href="/portfolio" className="text-sm text-primary hover:underline">
              Portfolio
            </Link>
            <Link href="/about" className="text-sm text-primary hover:underline">
              About Us
            </Link>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
