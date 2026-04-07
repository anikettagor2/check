"use client";

import { AuthProvider } from "@/lib/context/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { BrandingProvider } from "@/lib/context/branding-context";
import { setupAbortErrorSuppression } from "@/lib/video/suppressAbortError";

import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // useEffect(() => {
  //   // Setup console error suppression for AbortError
  //   setupAbortErrorSuppression();
  //   // Disable right-click
  //   const handleContextMenu = (e: MouseEvent) => {
  //     e.preventDefault();
  //   };

  //   // Disable common developer shortcut keys
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     // Prevent F12
  //     if (e.key === 'F12' || e.keyCode === 123) {
  //       e.preventDefault();
  //     }
      
  //     // Prevent Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
  //     if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
  //       e.preventDefault();
  //     }

  //     // Prevent Command+Option+I, Command+Option+J, Command+Option+C (Mac)
  //     if (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
  //       e.preventDefault();
  //     }

  //     // Prevent Ctrl+U (View Source)
  //     if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
  //       e.preventDefault();
  //     }
      
  //     // Prevent Command+Option+U (View Source Mac)
  //     if (e.metaKey && e.altKey && (e.key === 'U' || e.key === 'u')) {
  //       e.preventDefault();
  //     }
  //   };

  //   document.addEventListener('contextmenu', handleContextMenu);
  //   document.addEventListener('keydown', handleKeyDown);

  //   return () => {
  //     document.removeEventListener('contextmenu', handleContextMenu);
  //     document.removeEventListener('keydown', handleKeyDown);
  //   };
  // }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Service workers can hold stale app shell/chunk references during local dev.
    // Keep SW disabled in development to avoid ChunkLoadError after restarts.
    if (process.env.NODE_ENV !== 'production') {
      const cleanupDevServiceWorkers = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations
              .filter((registration) => registration.active?.scriptURL?.includes('/video-streaming-sw.js'))
              .map((registration) => registration.unregister())
          );
        } catch (error) {
          console.warn('Service worker cleanup failed in development:', error);
        }
      };

      void cleanupDevServiceWorkers();
      return;
    }

    const registerVideoSw = async () => {
      try {
        await navigator.serviceWorker.register('/video-streaming-sw.js');
      } catch (error) {
        console.warn('Video streaming service worker registration failed:', error);
      }
    };

    void registerVideoSw();
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        <BrandingProvider>
          {children}
        </BrandingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
