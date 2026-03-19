# Adaptive Video Streaming - Quick Reference

## 🎯 What You Have

A complete adaptive video streaming system that automatically adjusts video quality based on network bandwidth.

## 📦 What Was Created

### Core Modules (in `/src/lib/streaming/`)

1. **bandwidth-detector.ts** - Monitors network bandwidth in real-time
2. **hls-quality-manager.ts** - Manages video quality variants
3. **adaptive-streaming-manager.ts** - Orchestrates the entire streaming system
4. **index.ts** - Exports all utilities

### UI Components (in `/src/components/streaming/`)

1. **adaptive-video-player.tsx** - Enhanced video player with adaptive streaming
2. **quality-selector.tsx** - Quality selection UI + network status display
3. **adaptive-video-example.tsx** - Complete working example

### Documentation

1. **ADAPTIVE-VIDEO-STREAMING-INTEGRATION.md** - Comprehensive integration guide
2. **ADAPTIVE-VIDEO-IMPLEMENTATION-CHECKLIST.md** - Step-by-step checklist
3. **REVIEW-PAGE-INTEGRATION-GUIDE.md** - Exact code changes for review page
4. **STREAMING-QUICK-REFERENCE.md** - This file

## 🚀 Quick Start

### 1. Install Dependency

```bash
npm install hls.js
```

### 2. Import Components

```typescript
import AdaptiveVideoPlayer from "@/components/streaming/adaptive-video-player";
import { QualitySelector } from "@/components/streaming/quality-selector";
```

### 3. Use in Your Page

```typescript
<AdaptiveVideoPlayer
  ref={playerRef}
  src={videoUrl}
  autoQuality={true}
  onQualityChange={handleQualityChange}
/>

<QualitySelector
  qualities={availableQualities}
  currentQuality={currentQuality}
  onQualitySelect={(quality) => playerRef.current?.setQuality(quality)}
/>
```

That's it! The rest happens automatically.

## 🎬 Key Features

✅ **Automatic Quality Adjustment** - Changes quality based on bandwidth  
✅ **Manual Quality Control** - Users can override auto quality  
✅ **Network Monitoring** - Real-time bandwidth detection  
✅ **Fallback Support** - Works with regular MP4 and HLS videos  
✅ **Analytics** - Track streaming performance  
✅ **Compatible** - Maintains existing VideoPlayer API

## 📊 Quality Levels

| Bandwidth | Quality   | Resolution | Bitrate      |
| --------- | --------- | ---------- | ------------ |
| < 1 Mbps  | Low       | 240p       | 300 Kbps     |
| 1-3 Mbps  | Fair      | 360p       | 700 Kbps     |
| 3-8 Mbps  | Good      | 480p-720p  | 1.2-2.5 Mbps |
| > 8 Mbps  | Excellent | 1080p-4K   | 5-15 Mbps    |

## 🔌 API Reference

### AdaptiveVideoPlayer Ref Methods

```typescript
playerRef.current?.seekTo(120); // Jump to 2 minutes
playerRef.current?.play(); // Play video
playerRef.current?.pause(); // Pause video
playerRef.current?.setQuality(quality); // Change quality
playerRef.current?.getCurrentQuality(); // Get current quality
playerRef.current?.getAvailableQualities(); // Get all qualities
playerRef.current?.getNetworkMetrics(); // Get network stats
playerRef.current?.getAnalytics(); // Get performance metrics
```

### Network Metrics

```typescript
const metrics = playerRef.current?.getNetworkMetrics();
// {
//   bandwidth: 5000000,      // bits per second
//   latency: 50,             // milliseconds
//   packetLoss: 0,           // percentage
//   quality: 'good',         // poor|fair|good|excellent
//   connectionType: 'wifi'   // 4g|3g|2g|wifi|ethernet|unknown
// }
```

### Analytics

```typescript
const analytics = playerRef.current?.getAnalytics();
// {
//   totalBytesTransferred: 1024000,
//   averageBitrate: 2500000,
//   qualityChanges: [...],
//   rebufferingCount: 2,
//   ...
// }
```

## 🛠️ Configuration

### Auto Quality (Default)

```typescript
<AdaptiveVideoPlayer
  autoQuality={true}  // Automatically adjusts quality
/>
```

### Manual Quality Only

```typescript
<AdaptiveVideoPlayer
  autoQuality={false}  // User controls quality
/>
```

### Source Resolution

```typescript
<AdaptiveVideoPlayer
  sourceResolution="4K"  // Available qualities depend on source
/>
// Options: 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p (4K)
```

## 📱 Responsive Design

**Desktop (High Bandwidth):**

- Source: 4K
- Auto: adjusts to available qualities

**Tablet (Medium Bandwidth):**

- Source: 1080p
- Auto: typically settles on 720p-1080p

**Mobile (Low Bandwidth):**

- Source: 720p
- Auto: typically settles on 480p

## 🧪 Testing Tips

### Simulate Low Bandwidth

```typescript
import { getBandwidthDetector } from "@/lib/streaming/bandwidth-detector";

const detector = getBandwidthDetector();
detector.simulateBandwidth(500000); // 500 Kbps
```

### Check Bandwidth

```typescript
const metrics = playerRef.current?.getNetworkMetrics();
console.log(`Current bandwidth: ${metrics.bandwidth / 1000000} Mbps`);
```

### Monitor Quality Changes

```typescript
playerRef.current?.addEventListener("quality-change", (e) => {
  console.log("Quality changed to:", e.detail.quality.name);
});
```

## 🐛 Common Issues & Fixes

### Quality Not Changing

**Problem:** Auto quality isn't switching  
**Solution:** Check bandwidth detection: `detector.getMetrics().bandwidth`

### High Buffering

**Problem:** Video stutters frequently  
**Solution:** Lower initial quality or improve connection

### HLS.js Not Loading

**Problem:** Error in console about HLS.js  
**Solution:** Run `npm install hls.js` or clear browser cache

## 📈 Integration Effort

| Task              | Time       | Difficulty |
| ----------------- | ---------- | ---------- |
| Install hls.js    | 2 min      | Easy       |
| Add imports       | 5 min      | Easy       |
| Replace component | 10 min     | Easy       |
| Add UI controls   | 10 min     | Easy       |
| Test              | 15 min     | Easy       |
| **Total**         | **42 min** | **Easy**   |

## 📚 Documentation Files

| File                                       | Purpose                |
| ------------------------------------------ | ---------------------- |
| ADAPTIVE-VIDEO-STREAMING-INTEGRATION.md    | Full technical guide   |
| ADAPTIVE-VIDEO-IMPLEMENTATION-CHECKLIST.md | Step-by-step checklist |
| REVIEW-PAGE-INTEGRATION-GUIDE.md           | Exact code changes     |
| STREAMING-QUICK-REFERENCE.md               | This quick reference   |

## ✨ Advanced Features

### Custom Bandwidth Thresholds

```typescript
const manager = new AdaptiveStreamingManager("1080p", {
  qualityChangeThreshold: 25, // 25% change required
  bufferingThreshold: 8, // 8 seconds buffer
});
```

### Event Monitoring

```typescript
manager.onStreamingEvent((event) => {
  if (event.type === "quality-change") {
    console.log("Quality changed:", event.data.quality);
  } else if (event.type === "rebuffering") {
    console.log("Rebuffering occurred");
  }
});
```

### Viewport-Aware Quality

```typescript
const quality = manager.getRecommendedQuality(bandwidth, viewportHeight);
// Considers both bandwidth AND viewport size
```

## 🎓 Learning Path

1. **Read:** ADAPTIVE-VIDEO-STREAMING-INTEGRATION.md
2. **Review:** adaptive-video-example.tsx (working example)
3. **Follow:** REVIEW-PAGE-INTEGRATION-GUIDE.md (step-by-step)
4. **Implement:** Copy exact code changes
5. **Test:** Verify in browser
6. **Monitor:** Check analytics

## 💡 Pro Tips

- Enable analytics (`trackAnalytics: true`) for insights
- Test on mobile with bandwidth throttling
- Set `sourceResolution` based on actual video
- Use `compact={true}` for quality selector on mobile
- Monitor rebuffering rate as quality indicator

## 🔗 Next Steps

1. Install hls.js: `npm install hls.js`
2. Follow REVIEW-PAGE-INTEGRATION-GUIDE.md for exact changes
3. Test with HLS URL: `revision.hlsUrl`
4. Monitor with analytics display
5. Gather user feedback on quality switching

## 📞 Need Help?

- Check console errors (browser DevTools)
- Review integration guide for troubleshooting
- Test with example component first
- Verify video URLs are correct
- Check Network tab in DevTools

---

**Status:** ✅ Ready to implement  
**Effort:** ~40 minutes  
**Dependencies:** hls.js  
**Breaking Changes:** None (fully backward compatible)
