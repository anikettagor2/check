/**
 * HLS Optimization: Usage Examples & Integration Guide
 * 
 * Real-world examples of how to use the optimized HLS streaming system
 */

import React from 'react';

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 1: Basic HLS Player Integration
 * ─────────────────────────────────────────────────────────────────────
 */

import { OptimizedHLSPlayer } from '@/components/optimized-hls-player';

export function VideoPlayerPage() {
  const hlsUrl = 'https://firebasestorage.googleapis.com/...master.m3u8';

  return (
    <OptimizedHLSPlayer
      hlsUrl={hlsUrl}
      title="My Video"
      projectName="My Project"
      autoPlay={false}
      preload="metadata"
      onTimeUpdate={(currentTime, duration) => {
        console.log(`Playing: ${currentTime}s / ${duration}s`);
      }}
      className="w-full aspect-video"
    />
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 2: With Preloading for Faster Startup
 * ─────────────────────────────────────────────────────────────────────
 */

import { useVideoPreload } from '@/lib/streaming/video-preload';

export function OptimizedVideoPlayer({ hlsUrl }: { hlsUrl: string }) {
  // This hook automatically preloads the manifest and first segments
  const { isPreloading } = useVideoPreload(hlsUrl, true);

  return (
    <div>
      {isPreloading && <p>Loading video...</p>}
      <OptimizedHLSPlayer
        hlsUrl={hlsUrl}
        autoPlay={true}
        preload="auto"
      />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 3: Upload Video with Cache Metadata
 * ─────────────────────────────────────────────────────────────────────
 */

// import { uploadHLSFilesParallel } from '@/lib/firebase/hls-metadata';

// async function uploadVideoWithOptimizedMetadata() {
//   // Example files - replace with actual Blob/File objects
//   // const masterPlaylistBlob = new Blob(['#EXTM3U8...'], { type: 'application/vnd.apple.mpegurl' });
//   // const segment0Blob = new Blob(['segment data'], { type: 'video/mp2t' });
//   // const segment1Blob = new Blob(['segment data'], { type: 'video/mp2t' });

//   const files = [
//     {
//       file: masterPlaylistBlob,
//       path: 'projects/123/revisions/abc/hls/master.m3u8',
//     },
//     {
//       file: segment0Blob,
//       path: 'projects/123/revisions/abc/hls/segments/segment-0.ts',
//     },
//     {
//       file: segment1Blob,
//       path: 'projects/123/revisions/abc/hls/segments/segment-1.ts',
//     },
//     // ... more segments
//   ];

//   try {
//     const results = await uploadHLSFilesParallel(files, (current, total) => {
//       console.log(`Uploaded ${current}/${total} files`);
//     });

//     console.log('All files uploaded with optimized cache headers');
//   } catch (error) {
//     console.error('Upload failed:', error);
//   }
// }

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 4: Detect Network Speed & Configure HLS
 * ─────────────────────────────────────────────────────────────────────
 */

import {
  detectNetworkSpeed,
  selectHLSPreset,
  getOptimizedHLSConfig,
} from '@/lib/streaming/hls-config';

export function NetworkAwarePlayer({ hlsUrl }: { hlsUrl: string }) {
  const [networkProfile, setNetworkProfile] = React.useState<any>(null);

  React.useEffect(() => {
    const profile = detectNetworkSpeed();
    setNetworkProfile(profile);
    console.log('Network Profile:', profile);
    // {
    //   name: 'fast' | 'medium' | 'slow',
    //   bandwidth: 20,
    //   targetLevel: -1,
    //   bufferTarget: 6
    // }
  }, []);

  const hlsPreset = selectHLSPreset(networkProfile || { name: 'medium' });

  return (
    <div>
      <p>Network: {networkProfile?.name}</p>
      <p>Bandwidth: {networkProfile?.bandwidth}Mbps</p>
      <OptimizedHLSPlayer hlsUrl={hlsUrl} />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 5: Batch Update Existing Video Metadata (Cloud Functions)
 * ─────────────────────────────────────────────────────────────────────
 */

// Frontend code to trigger metadata optimization
import { getFunctions, httpsCallable } from 'firebase/functions';

async function optimizeExistingVideo(projectId: string, revisionId: string) {
  const functions = getFunctions();
  const optimizeMetadata = httpsCallable(functions, 'optimizeExistingHLSMetadata');

  try {
    const result = await optimizeMetadata({
      projectId,
      revisionId,
    });
    console.log('Optimization result:', result.data);
  } catch (error) {
    console.error('Failed to optimize:', error);
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 6: Complete Review Modal Integration (Already Implemented)
 * ─────────────────────────────────────────────────────────────────────
 */

// See: src/app/dashboard/components/review-system-modal.tsx
// The component now:
// 1. Preloads HLS video when modal opens
// 2. Shows OptimizedHLSPlayer when hlsUrl is available
// 3. Falls back to direct video when only videoUrl exists
// 4. Tracks playback time for resume functionality

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 7: Custom HLS Configuration
 * ─────────────────────────────────────────────────────────────────────
 */

import { HLS_PRESETS } from '@/lib/streaming/hls-config';

// Use a preset
const balancedConfig = HLS_PRESETS.balanced;
// {
//   targetBufferTime: 8,
//   maxBufferLength: 30,
//   lowLatencyMode: true,
//   startFragPrefetch: true
// }

// Use preset "fastStart" for immediate playback
const fastStartConfig = HLS_PRESETS.fastStart;
// {
//   targetBufferTime: 4,      // Less buffering
//   maxBufferLength: 15,       // Minimal buffer
//   lowLatencyMode: true,
//   startFragPrefetch: true
// }

// Use preset "reliable" for stable playback
const reliableConfig = HLS_PRESETS.reliable;
// {
//   targetBufferTime: 15,     // More buffering
//   maxBufferLength: 60,       // Large buffer
//   lowLatencyMode: false,
//   startFragPrefetch: false
// }

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 8: IndexedDB Cache Management
 * ─────────────────────────────────────────────────────────────────────
 */

import {
  getManifestFromDB,
  cacheManifestInDB,
  clearHLSCache,
} from '@/lib/streaming/video-preload';

// Manually cache a manifest
async function cacheVideoManual(hlsUrl: string) {
  const response = await fetch(hlsUrl);
  const content = await response.text();
  
  // Cache with 60 minute TTL
  await cacheManifestInDB(hlsUrl, content, 60);
}

// Retrieve from cache
async function getVideoFromCache(hlsUrl: string) {
  const cached = await getManifestFromDB(hlsUrl);
  if (cached) {
    console.log('Using cached manifest');
    return cached;
  }
  console.log('Manifest not in cache');
  return null;
}

// Clear all cached manifests
async function clearAllCache() {
  await clearHLSCache();
  console.log('All HLS cache cleared');
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 9: Error Handling & Recovery
 * ─────────────────────────────────────────────────────────────────────
 */

export function RobustVideoPlayer({ hlsUrl }: { hlsUrl: string }) {
  const [error, setError] = React.useState<string | null>(null);

  const handleError = (err: Error) => {
    console.error('Video player error:', err);
    setError(err.message);
  };

  return (
    <div>
      {error ? (
        <div className="bg-red-100 p-4 rounded">
          <p>Video error: {error}</p>
          <button onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <OptimizedHLSPlayer
          hlsUrl={hlsUrl}
          onError={handleError}
        />
      )}
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Example 10: Analytics Integration
 * ─────────────────────────────────────────────────────────────────────
 */

export function AnalyticsEnabledPlayer({ hlsUrl }: { hlsUrl: string }) {
  const startTimeRef = React.useRef(Date.now());

  return (
    <OptimizedHLSPlayer
      hlsUrl={hlsUrl}
      onPlaying={() => {
        // Track video playback started
        const startupTime = Date.now() - startTimeRef.current;
        console.log('Time to first playable frame:', startupTime, 'ms');
        // Send to analytics: ga.event('video_start', { startup_time: startupTime })
      }}
      onTimeUpdate={(current, duration) => {
        // Track watch progress
        const progress = (current / duration) * 100;
        if (progress % 25 === 0) {
          // Send milestone event every 25%
          console.log('Video progress:', progress, '%');
        }
      }}
      onPause={() => {
        // Track pause events
        console.log('Video paused');
      }}
    />
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Performance Optimization Tips
 * ─────────────────────────────────────────────────────────────────────
 */

/**
 * Tip 1: Use preload="metadata" for faster startup
 * 
 * This loads video metadata without downloading segments until play is pressed
 */
function OptimizedLoad({ hlsUrl }: { hlsUrl: string }) {
  return (
    <OptimizedHLSPlayer
      hlsUrl={hlsUrl}
      preload="metadata"  // Instead of 'auto' or 'none'
    />
  );
}

/**
 * Tip 2: Combine preloading with auto-play for instant playback
 */
function AutoplayWithPreload({ hlsUrl }: { hlsUrl: string }) {
  const { isPreloading } = useVideoPreload(hlsUrl, true);

  return (
    <OptimizedHLSPlayer
      hlsUrl={hlsUrl}
      autoPlay={true}      // Auto-play when loaded
      preload="auto"       // Preload all segments
    />
  );
}

/**
 * Tip 3: Lazy load the player component
 */
import dynamic from 'next/dynamic';

const LazyHLSPlayer = dynamic(() => 
  import('@/components/optimized-hls-player')
    .then(mod => ({ default: mod.OptimizedHLSPlayer })),
  { ssr: false, loading: () => <p>Loading video...</p> }
);

function LazyLoadedVideo({ hlsUrl }: { hlsUrl: string }) {
  return <LazyHLSPlayer hlsUrl={hlsUrl} />;
}

/**
 * Tip 4: Monitor bandwidth and adapt quality
 */
function AdaptivePlayer({ hlsUrl }: { hlsUrl: string }) {
  const profile = detectNetworkSpeed();

  return (
    <OptimizedHLSPlayer
      hlsUrl={hlsUrl}
      // Lower target buffer on slow networks
      // Higher buffer on fast networks
      // (Handled automatically by HLS.js)
    />
  );
}

/**
 * Tip 5: Use intersection observer to lazy load videos below fold
 */
function LazyVideoSection({ hlsUrl }: { hlsUrl: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = React.useState(false);

  React.useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
      }
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {shouldLoad ? (
        <OptimizedHLSPlayer hlsUrl={hlsUrl} />
      ) : (
        <div>Video will load when visible...</div>
      )}
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────
 * Migration from Old Player to Optimized Player
 * ─────────────────────────────────────────────────────────────────────
 */

// OLD CODE (Still supported):
// <video src={videoUrl} controls />

// NEW CODE (Optimized):
// <OptimizedHLSPlayer hlsUrl={hlsUrl} />

// COMPATIBILITY:
// If hlsUrl is available, use OptimizedHLSPlayer
// Otherwise, fall back to direct <video> element

/**
 * ─────────────────────────────────────────────────────────────────────
 * Testing Checklist
 * ─────────────────────────────────────────────────────────────────────
 */

// Test Cases:
// ✅ Video loads and plays within 2 seconds
// ✅ Quality switches automatically based on network
// ✅ Buffering spinner appears only briefly
// ✅ Audio/video sync is perfect
// ✅ Fullscreen works properly
// ✅ Pause/resume maintains position
// ✅ Volume control works
// ✅ Fast-forward/rewind responsive
// ✅ Error recovery automatic
// ✅ Mobile devices work smoothly
// ✅ Safari/Firefox/Chrome compatible
// ✅ Offline detection handled gracefully

export default {};
