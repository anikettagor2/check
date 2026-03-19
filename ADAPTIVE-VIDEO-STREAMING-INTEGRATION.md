# Adaptive Video Streaming Integration Guide

## Overview

This guide shows how to integrate adaptive video streaming into your EditoHub review page. The system automatically adjusts video quality based on network bandwidth while allowing manual quality selection.

## Components

### 1. **BandwidthDetector** (`lib/streaming/bandwidth-detector.ts`)

Monitors network conditions and measures available bandwidth.

**Features:**

- Automatic bandwidth detection
- Network quality estimation
- Connection type detection (4G, 3G, 2G, WiFi, Ethernet)
- Historical bandwidth tracking
- Real-time metrics

**Usage:**

```typescript
import { getBandwidthDetector } from "@/lib/streaming/bandwidth-detector";

const detector = getBandwidthDetector();
const metrics = detector.getMetrics();
// { bandwidth: 5000000, latency: 50, packetLoss: 0, quality: 'good', connectionType: 'wifi' }

// Subscribe to changes
const unsubscribe = detector.onMetricsChange((metrics) => {
  console.log("Network quality changed:", metrics.quality);
});
```

### 2. **HLSQualityManager** (`lib/streaming/hls-quality-manager.ts`)

Manages video quality variants and quality selection logic.

**Features:**

- Predefined quality levels (240p to 4K)
- Quality selection based on bandwidth
- Quality level management
- Viewport-aware recommendations

**Usage:**

```typescript
import HLSQualityManager from "@/lib/streaming/hls-quality-manager";

const manager = new HLSQualityManager("1080p"); // Source resolution
const quality = manager.getQualityForBandwidth(5000000); // 5 Mbps
// Returns appropriate quality based on bandwidth

const available = manager.getAvailableQualities();
manager.setQuality(quality);
```

### 3. **AdaptiveStreamingManager** (`lib/streaming/adaptive-streaming-manager.ts`)

Orchestrates bandwidth detection, quality management, and analytics.

**Features:**

- Automatic quality adjustment based on bandwidth
- Streaming analytics and metrics
- Event-based notifications
- Error tracking and logging
- Buffering state management

**Usage:**

```typescript
import AdaptiveStreamingManager from "@/lib/streaming/adaptive-streaming-manager";

const manager = new AdaptiveStreamingManager("1080p", {
  enableAutoQuality: true,
  qualityChangeThreshold: 20, // 20% change required
  trackAnalytics: true,
});

// Get analytics
const analytics = manager.getAnalytics();

// Subscribe to events
manager.onStreamingEvent((event) => {
  if (event.type === "quality-change") {
    console.log("Quality changed to:", event.data.quality.name);
  }
});
```

### 4. **AdaptiveVideoPlayer** (`components/streaming/adaptive-video-player.tsx`)

Enhanced video player wrapper that maintains VideoPlayer API compatibility.

**Features:**

- Maintains existing VideoPlayer ref API (seekTo, play, pause)
- HLS.js integration for adaptive bitrate streaming
- Quality change callbacks
- Network state tracking
- Full analytics access

**Props:**

```typescript
interface AdaptiveVideoPlayerProps {
  src: string; // Video URL or HLS manifest URL
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onQualityChange?: (quality: HLSQuality) => void;
  onNetworkStateChange?: (state: string) => void;
  autoQuality?: boolean;
  sourceResolution?: string; // '240p' to '4K'
}
```

**Ref API:**

```typescript
interface AdaptiveVideoPlayerRef {
  seekTo: (time: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  getCurrentQuality: () => HLSQuality | null;
  setQuality: (quality: HLSQuality) => void;
  getAvailableQualities: () => HLSQuality[];
  getNetworkMetrics: () => NetworkQualityMetrics;
  getAnalytics: () => StreamingAnalytics;
}
```

### 5. **QualitySelector** (`components/streaming/quality-selector.tsx`)

UI component for manual quality selection and network status display.

**Components:**

- `QualitySelector` - Quality selection dropdown
- `NetworkStatus` - Network quality indicator
- `StreamingAnalytics` - Performance metrics display

**Usage:**

```typescript
import { QualitySelector, NetworkStatus, StreamingAnalytics } from '@/components/streaming/quality-selector';

<QualitySelector
  qualities={availableQualities}
  currentQuality={currentQuality}
  onQualitySelect={(quality) => playerRef.current?.setQuality(quality)}
  networkQuality="good"
  showBitrate={true}
/>
```

## Integration with Review Page

### Step 1: Replace VideoPlayer with AdaptiveVideoPlayer

```typescript
import AdaptiveVideoPlayer from '@/components/streaming/adaptive-video-player';

// In your review page component
<AdaptiveVideoPlayer
  ref={playerRef}
  src={(revision as any).hlsUrl || revision.videoUrl}
  sourceResolution="4K" // or detect from revision.resolution
  onTimeUpdate={handleTimeUpdate}
  onDurationChange={setDuration}
  onQualityChange={handleQualityChange}
/>
```

### Step 2: Add Quality Selector UI

```typescript
import { QualitySelector, NetworkStatus } from '@/components/streaming/quality-selector';

const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);
const [availableQualities, setAvailableQualities] = useState<HLSQuality[]>([]);
const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor'>('good');

const handleQualityChange = (quality: HLSQuality) => {
  setCurrentQuality(quality);
};

const handleNetworkChange = (quality: string) => {
  setNetworkQuality(quality as any);
};

// In JSX, add the quality selector to your controls area
<div className="flex items-center gap-4">
  <NetworkStatus
    quality={networkQuality}
    bandwidth={playerRef.current?.getNetworkMetrics().bandwidth}
    compact={true}
  />

  <QualitySelector
    qualities={availableQualities}
    currentQuality={currentQuality}
    onQualitySelect={(quality) => playerRef.current?.setQuality(quality)}
    networkQuality={networkQuality}
  />
</div>
```

### Step 3: Enable Auto Quality (Optional)

The system automatically adjusts quality based on bandwidth. You can control this behavior:

```typescript
// Disable auto quality for user control
<AdaptiveVideoPlayer
  src={videoUrl}
  autoQuality={false}
/>

// Or provide manual control in UI
<button onClick={() => playerRef.current?.setQuality(qualityOption)}>
  Change Quality
</button>
```

## Bandwidth-to-Quality Mapping

The system automatically maps bandwidth to appropriate quality:

| Bandwidth | Quality   | Resolution | Bitrate      |
| --------- | --------- | ---------- | ------------ |
| < 1 Mbps  | Poor      | 240p       | 300 Kbps     |
| 1-3 Mbps  | Fair      | 360p       | 700 Kbps     |
| 3-8 Mbps  | Good      | 480p-720p  | 1.2-2.5 Mbps |
| > 8 Mbps  | Excellent | 1080p-4K   | 5-15 Mbps    |

## Advanced Usage

### Custom Configuration

```typescript
const manager = new AdaptiveStreamingManager("1080p", {
  enableAutoQuality: true,
  qualityChangeThreshold: 25, // 25% change required
  bufferingThreshold: 8, // seconds
  rebufferingThreshold: 3, // seconds
  trackAnalytics: true,
});
```

### Monitoring Events

```typescript
playerRef.current?.addEventListener("quality-change", (e) => {
  console.log("Quality changed:", e.detail);
});

playerRef.current?.addEventListener("buffering-start", () => {
  console.log("Buffering started");
});
```

### Accessing Analytics

```typescript
const analytics = playerRef.current?.getAnalytics();
console.log({
  averageBitrate: analytics.averageBitrate,
  qualityChanges: analytics.qualityChanges.length,
  rebufferingCount: analytics.rebufferingCount,
  totalBytesTransferred: analytics.totalBytesTransferred,
});
```

## HLS.js Installation

The AdaptiveVideoPlayer uses HLS.js for adaptive bitrate streaming. Install it if not already present:

```bash
npm install hls.js
```

## Fallback Support

If HLS is not available:

- Falls back to native HLS support (if browser supports it)
- Falls back to progressive download for non-HLS URLs
- All player methods remain functional

## Performance Optimization

### Recommended Settings for different scenarios:

**High-bandwidth environments:**

```typescript
const manager = new AdaptiveStreamingManager("4K", {
  enableAutoQuality: true,
  qualityChangeThreshold: 50, // Less frequent changes
});
```

**Mobile/Low-bandwidth:**

```typescript
const manager = new AdaptiveStreamingManager("720p", {
  enableAutoQuality: true,
  qualityChangeThreshold: 10, // More responsive
  bufferingThreshold: 5,
  rebufferingThreshold: 2,
});
```

**Live streaming:**

```typescript
const manager = new AdaptiveStreamingManager("1080p", {
  enableAutoQuality: true,
  bufferingThreshold: 3,
  rebufferingThreshold: 1,
});
```

## Troubleshooting

### HLS.js Not Loading

- Check browser console for errors
- Ensure HLS.js is installed: `npm install hls.js`
- Player will automatically fall back to native HLS support

### Quality Not Changing

- Check network bandwidth detection: `detector.getMetrics()`
- Verify auto quality is enabled: `manager.isAutoQualityEnabled()`
- Check bandwidth threshold: `detector.getRecommendedBitrate()`

### High Buffering

- Increase buffer thresholds in configuration
- Check network connection stability
- Lower initial quality setting

## API Reference Summary

### BandwidthDetector

- `getMetrics()` - Current network metrics
- `getRecommendedBitrate()` - 70% of available bandwidth
- `canSupport(bitrate, margin)` - Check if bitrate is playable
- `onMetricsChange(callback)` - Subscribe to metrics
- `getHistory()` - Bandwidth history
- `simulateBandwidth(bps)` - For testing

### AdaptiveStreamingManager

- `setQuality(quality, reason)` - Manual quality change
- `getCurrentQuality()` - Current quality
- `getAvailableQualities()` - All qualities
- `getNetworkMetrics()` - Current network state
- `getAnalytics()` - Streaming analytics
- `onStreamingEvent(callback)` - Subscribe to events
- `recordBytesTransferred(bytes)` - Update analytics
- `getSummary()` - Get streaming summary

### AdaptiveVideoPlayer Ref

- `seekTo(time)` - Jump to time
- `play()` - Start playback
- `pause()` - Pause playback
- `getCurrentQuality()` - Current quality
- `setQuality(quality)` - Change quality
- `getAvailableQualities()` - All qualities
- `getNetworkMetrics()` - Network state
- `getAnalytics()` - Streaming analytics
