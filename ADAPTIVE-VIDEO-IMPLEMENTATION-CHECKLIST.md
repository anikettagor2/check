# Adaptive Video Streaming - Implementation Checklist

## ✅ Components Created

### Core Streaming Modules

- [x] **BandwidthDetector** - Network bandwidth monitoring
  - Real-time bandwidth detection
  - Network quality estimation
  - Connection type detection
  - Metrics history tracking

- [x] **HLSQualityManager** - Quality variant management
  - Predefined quality levels (240p to 4K)
  - Dynamic quality selection based on bandwidth
  - Viewport-aware recommendations
  - Quality metadata handling

- [x] **AdaptiveStreamingManager** - Main orchestrator
  - Bandwidth-to-quality mapping
  - Auto-quality adjustment
  - Streaming analytics
  - Event-based notifications

### UI Components

- [x] **AdaptiveVideoPlayer** - Enhanced video player
  - Maintains VideoPlayer API compatibility
  - HLS.js integration
  - Quality change handling
  - Network state tracking
  - Full analytics support

- [x] **QualitySelector** - Quality UI controls
  - Quality selection dropdown
  - Network status indicator
  - Streaming analytics display

### Documentation & Examples

- [x] Integration guide
- [x] Example component
- [x] Streaming module index/exports
- [x] Implementation checklist (this file)

## 📋 Integration Steps

### Step 1: Install Dependencies

```bash
npm install hls.js
```

### Step 2: Import Components

In your review page (`app/dashboard/projects/[id]/review/[revisionId]/page.tsx`):

```typescript
import AdaptiveVideoPlayer, {
  AdaptiveVideoPlayerRef,
} from "@/components/streaming/adaptive-video-player";
import {
  QualitySelector,
  NetworkStatus,
} from "@/components/streaming/quality-selector";
import { HLSQuality } from "@/lib/streaming/hls-quality-manager";
```

### Step 3: Update State Management

Add these states to your review page component:

```typescript
const playerRef = useRef<AdaptiveVideoPlayerRef>(null);
const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);
const [availableQualities, setAvailableQualities] = useState<HLSQuality[]>([]);
const [networkQuality, setNetworkQuality] = useState<
  "poor" | "fair" | "good" | "excellent"
>("good");
```

### Step 4: Replace VideoPlayer Component

**Before:**

```typescript
<VideoPlayer
  ref={playerRef}
  src={(revision as any).hlsUrl || revision.videoUrl}
  onTimeUpdate={handleTimeUpdate}
  onDurationChange={setDuration}
/>
```

**After:**

```typescript
<AdaptiveVideoPlayer
  ref={playerRef}
  src={(revision as any).hlsUrl || revision.videoUrl}
  sourceResolution="4K" // or detect from revision metadata
  onTimeUpdate={handleTimeUpdate}
  onDurationChange={setDuration}
  onQualityChange={(quality) => setCurrentQuality(quality)}
  onNetworkStateChange={setNetworkQuality}
  autoQuality={true}
/>
```

### Step 5: Add Quality Selector UI

Add to your controls section (around line ~360 in page.tsx):

```typescript
{/* Quality Selector and Network Status */}
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

### Step 6: Handle Quality Updates

Add callback handler:

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    if (playerRef.current) {
      const qualities = playerRef.current.getAvailableQualities();
      setAvailableQualities(qualities);

      const quality = playerRef.current.getCurrentQuality();
      if (quality) {
        setCurrentQuality(quality);
      }
    }
  }, 500);

  return () => clearTimeout(timer);
}, []);
```

### Step 7: Update Download Handler (Optional)

If needed, detect current quality in download handler:

```typescript
const handleDownload = async () => {
  const currentQuality = playerRef.current?.getCurrentQuality();
  console.log("Downloading video at quality:", currentQuality?.name);

  // Use current quality info if needed
  // ...
};
```

## 🔄 Migration Checklist

- [ ] Install hls.js: `npm install hls.js`
- [ ] Create/verify `/src/lib/streaming/` directory exists
- [ ] Create/verify `/src/components/streaming/` directory exists
- [ ] Copy bandwidth-detector.ts to lib/streaming/
- [ ] Copy hls-quality-manager.ts to lib/streaming/
- [ ] Copy adaptive-streaming-manager.ts to lib/streaming/
- [ ] Copy streaming/index.ts to lib/streaming/
- [ ] Copy adaptive-video-player.tsx to components/streaming/
- [ ] Copy quality-selector.tsx to components/streaming/
- [ ] Update review page imports
- [ ] Replace VideoPlayer with AdaptiveVideoPlayer
- [ ] Add state management for quality
- [ ] Add QualitySelector UI component
- [ ] Test video playback with HLS URL
- [ ] Test quality switching
- [ ] Test fallback with non-HLS video URL
- [ ] Verify analytics display
- [ ] Test on mobile/low bandwidth connection

## 🧪 Testing Checklist

### Basic Functionality

- [ ] Video plays with regular URL
- [ ] Video plays with HLS URL
- [ ] Quality selector appears when multiple qualities available
- [ ] Network status indicator shows
- [ ] Playback controls work (play, pause, seek)

### Quality Switching

- [ ] Manual quality selection works
- [ ] Quality changes appear in UI
- [ ] Auto-quality adjusts on bandwidth change
- [ ] Quality changes are smooth (no major interruptions)

### Network Simulation (Optional)

- [ ] Simulate poor bandwidth → quality downscales
- [ ] Simulate good bandwidth → quality upscales
- [ ] Verify quality cooldown (no rapid changes)

### Analytics

- [ ] Analytics display shows correct values
- [ ] Quality change history is tracked
- [ ] Bitrate calculations are accurate

### Edge Cases

- [ ] Fallback to native HLS if HLS.js unavailable
- [ ] Fallback to progressive download for non-HLS
- [ ] Mobile/low-bandwidth handling
- [ ] Browser without Network Information API

## 📊 Configuration Options

### For Desktop (High Bandwidth)

```typescript
<AdaptiveVideoPlayer
  sourceResolution="4K"
  autoQuality={true}
/>
```

### For Mobile (Low Bandwidth)

```typescript
<AdaptiveVideoPlayer
  sourceResolution="720p"
  autoQuality={true}
/>
```

### For Strict Control (Manual)

```typescript
<AdaptiveVideoPlayer
  autoQuality={false}
/>
// User manually selects quality via QualitySelector
```

## 🚀 Deployment Guide

### Before Deploying

1. **Ensure HLS.js is in package.json:**

   ```json
   {
     "dependencies": {
       "hls.js": "^1.4.x"
     }
   }
   ```

2. **Verify Video URLs:**
   - HLS URLs should end with `.m3u8` or contain `hlsUrl`
   - Regular video URLs should end with `.mp4` or similar
   - Both should be accessible

3. **Test in Production Environment:**
   - Test with actual video files
   - Verify bandwidth detection works
   - Check quality switching latency

4. **Monitor Performance:**
   - Check for any console errors
   - Monitor streaming analytics
   - Track buffering incidents

### Performance Metrics to Monitor

- Average bitrate used
- Quality change frequency
- Buffering duration and frequency
- User abandonment rate
- Time to play (TTFP)

### Browser Support

| Browser        | HLS Support | Fallback              |
| -------------- | ----------- | --------------------- |
| Chrome/Edge    | HLS.js      | Native (if supported) |
| Firefox        | HLS.js      | Native (if supported) |
| Safari         | Native      | Native                |
| iOS Safari     | Native      | Native                |
| Android Chrome | HLS.js      | Native                |

## 📈 Analytics Integration (Optional)

To track streaming metrics in your analytics service:

```typescript
const handleAnalytics = useCallback(() => {
  const analytics = playerRef.current?.getAnalytics();
  const summary = playerRef.current?.getSummary?.();

  // Send to analytics service
  analyticsService.track("video_streaming", {
    quality: currentQuality?.name,
    duration: summary?.duration,
    averageBitrate: analytics?.averageBitrate,
    qualityChanges: analytics?.qualityChanges?.length,
    rebufferingCount: analytics?.rebufferingCount,
  });
}, [currentQuality]);
```

## 🆘 Troubleshooting

### Quality Not Changing

- Check if HLS URL is valid
- Verify bandwidth detection is working
- Check browser console for errors
- Disable browser cache

### High Buffering

- Increase buffer thresholds in config
- Check actual network bandwidth
- Verify video bitrate matches connection
- Consider lower initial quality

### HLS.js Not Loading

- Verify package.json has hls.js
- Check network tab for HLS.js load errors
- May need to clear browser cache
- Will automatically fallback to native support

### Ref Methods Not Available

- Ensure ref is properly attached to player
- Wait for component to mount (use useEffect)
- Check browser console for errors

## 📞 Support

For issues or questions:

1. Check console errors
2. Review integration guide
3. Test with example component
4. Check browser DevTools network tab
5. Verify video URLs are correct

## Next Steps

After successful integration:

1. Gather user feedback on quality and performance
2. Monitor streaming metrics in analytics
3. Fine-tune bandwidth thresholds if needed
4. Consider adding quality preset options
5. Monitor error rates and fix any issues
6. Optimize for specific regions/network types
