"use client";

import { useEffect } from "react";

type WatermarkState = {
  wrapper: HTMLElement;
  overlay: HTMLDivElement;
  fullscreenOverlay: HTMLDivElement;
  isSwitchingToWrapperFullscreen: boolean;
  onFullscreenChange: () => void;
};

const DEFAULT_COMPANY_NAME = "EditoHub";

function sanitizeWatermarkText(value?: string | null) {
  if (!value) return "";
  return value.trim().slice(0, 48);
}

function resolveWatermarkText(video: HTMLVideoElement) {
  // 1. Body-level override (set imperatively by the review page once project loads)
  const fromBody = sanitizeWatermarkText(document.body.dataset.watermarkName || document.body.dataset.clientName);
  if (fromBody) return fromBody;

  // 2. Closest ancestor with data-watermark-name (wrapper div)
  const fromContainer = sanitizeWatermarkText(
    video.closest("[data-watermark-name]")?.getAttribute("data-watermark-name") ||
    video.closest("[data-client-name]")?.getAttribute("data-client-name")
  );
  if (fromContainer && fromContainer !== "Client Review") return fromContainer;

  // 3. Attribute directly on the <video> element
  const fromVideo = sanitizeWatermarkText(
    video.getAttribute("data-watermark-name") || 
    video.dataset.watermarkName ||
    video.getAttribute("data-client-name") ||
    video.dataset.clientName
  );
  if (fromVideo && fromVideo !== "Client Review") return fromVideo;

  // 4. Environment variable fallback
  const fromEnv = sanitizeWatermarkText(process.env.NEXT_PUBLIC_COMPANY_NAME);
  if (fromEnv) return fromEnv;

  return DEFAULT_COMPANY_NAME;
}

function createWatermarkNode(text: string, isFullscreen: boolean) {
  const node = document.createElement("div");
  node.textContent = text;
  node.style.position = isFullscreen ? "fixed" : "absolute";
  node.style.left = "50%";
  node.style.top = "50%";
  node.style.transform = "translate(-50%, -50%)";
  node.style.opacity = "0.24";
  node.style.color = "#ffffff";
  node.style.fontWeight = "700";
  node.style.letterSpacing = "0.08em";
  node.style.textTransform = "uppercase";
  node.style.fontSize = "clamp(10px, 1.2vw, 18px)";
  node.style.textShadow = "0 1px 2px rgba(0,0,0,0.35)";
  node.style.pointerEvents = "none";
  node.style.userSelect = "none";
  node.style.webkitUserSelect = "none";
  node.style.zIndex = isFullscreen ? "2147483646" : "20";
  node.style.whiteSpace = "nowrap";
  node.style.display = isFullscreen ? "none" : "block";
  return node;
}

export function GlobalVideoWatermark() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const states = new Map<HTMLVideoElement, WatermarkState>();

    const setupVideo = (video: HTMLVideoElement) => {
      if (states.has(video)) return;

      const wrapper = video.parentElement;
      if (!wrapper) return;

      if (window.getComputedStyle(wrapper).position === "static") {
        wrapper.style.position = "relative";
      }

      const watermarkText = resolveWatermarkText(video);

      const overlay = createWatermarkNode(watermarkText, false);
      wrapper.appendChild(overlay);

      const fullscreenOverlay = createWatermarkNode(watermarkText, true);
      document.body.appendChild(fullscreenOverlay);

      const onFullscreenChange = () => {
        const state = states.get(video);
        if (!state) return;

        const fullscreenElement = document.fullscreenElement as HTMLElement | null;
        const isVideoInFullscreen = !!fullscreenElement && (fullscreenElement === video || fullscreenElement.contains(video));

        if (isVideoInFullscreen) {
          // If browser enters native fullscreen on <video>, switch to wrapper fullscreen
          // so HTML watermark overlays remain visible.
          if (fullscreenElement === video && !state.isSwitchingToWrapperFullscreen) {
            state.isSwitchingToWrapperFullscreen = true;
            document.exitFullscreen()
              .then(() => state.wrapper.requestFullscreen().catch(() => undefined))
              .finally(() => {
                window.setTimeout(() => {
                  const latestState = states.get(video);
                  if (latestState) {
                    latestState.isSwitchingToWrapperFullscreen = false;
                  }
                }, 250);
              });
            return;
          }

          const mountTarget = fullscreenElement === video ? state.wrapper : fullscreenElement;
          if (fullscreenOverlay.parentElement !== mountTarget) {
            mountTarget.appendChild(fullscreenOverlay);
          }

          fullscreenOverlay.style.position = "absolute";
          fullscreenOverlay.style.left = "50%";
          fullscreenOverlay.style.top = "50%";
          fullscreenOverlay.style.transform = "translate(-50%, -50%)";
          fullscreenOverlay.style.display = "block";
          overlay.style.display = "none";
          return;
        }

        if (fullscreenOverlay.parentElement !== document.body) {
          document.body.appendChild(fullscreenOverlay);
        }
        fullscreenOverlay.style.position = "fixed";
        fullscreenOverlay.style.display = "none";
        overlay.style.display = "block";
      };
      document.addEventListener("fullscreenchange", onFullscreenChange);

      states.set(video, {
        wrapper,
        overlay,
        fullscreenOverlay,
        isSwitchingToWrapperFullscreen: false,
        onFullscreenChange,
      });
    };

    const updateVideoWatermarks = () => {
      for (const [video, state] of states.entries()) {
        const newText = resolveWatermarkText(video);
        if (state.overlay.textContent !== newText) {
          state.overlay.textContent = newText;
          state.fullscreenOverlay.textContent = newText;
        }
      }
    };

    const teardownVideo = (video: HTMLVideoElement) => {
      const state = states.get(video);
      if (!state) return;

      document.removeEventListener("fullscreenchange", state.onFullscreenChange);

      state.overlay.remove();
      state.fullscreenOverlay.remove();
      states.delete(video);
    };

    const scanVideos = () => {
      const videos = Array.from(document.querySelectorAll("video"));
      videos.forEach((video) => setupVideo(video as HTMLVideoElement));

      for (const existingVideo of Array.from(states.keys())) {
        if (!document.body.contains(existingVideo)) {
          teardownVideo(existingVideo);
        }
      }
    };

    const observer = new MutationObserver(() => {
      scanVideos();
      updateVideoWatermarks();
    });

    scanVideos();
    // Watch entire document for data-watermark-name changes
    observer.observe(document.documentElement, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ["data-watermark-name", "data-client-name"]
    });

    // Persistent reactive update: in case of async data like Firebase project loading,
    // we keep checking for a valid watermark name indefinitely but at a lower rate after 10s.
    let ticks = 0;
    const pollInterval = setInterval(() => {
      ticks++;
      updateVideoWatermarks();
      
      // If we haven't found a valid name (still showing EditoHub) keep polling fast-ish (500ms)
      // Otherwise, slow down significantly to 2 seconds after the initial 10s burst.
      if (ticks > 20) {
        clearInterval(pollInterval);
        const slowInterval = setInterval(updateVideoWatermarks, 2000);
        (window as any)._watermarkSlowPoll = slowInterval;
      }
    }, 500);

    return () => {
      observer.disconnect();
      clearInterval(pollInterval);
      if ((window as any)._watermarkSlowPoll) clearInterval((window as any)._watermarkSlowPoll);
      for (const video of Array.from(states.keys())) {
        teardownVideo(video);
      }
    };
  }, []);

  return null;
}
