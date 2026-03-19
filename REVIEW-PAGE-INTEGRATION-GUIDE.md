# Review Page Integration - Detailed Step-by-Step

This guide shows exact code changes needed to integrate adaptive streaming into your review page.

## File: `app/dashboard/projects/[id]/review/[revisionId]/page.tsx`

### Step 1: Update Imports (at the top of the file)

**Add these new imports:**

```typescript
// Adaptive streaming components
import AdaptiveVideoPlayer, {
  AdaptiveVideoPlayerRef,
} from "@/components/streaming/adaptive-video-player";
import {
  QualitySelector,
  NetworkStatus,
  StreamingAnalytics,
} from "@/components/streaming/quality-selector";
import { HLSQuality } from "@/lib/streaming/hls-quality-manager";

// You can keep or remove the old VideoPlayer import depending on other uses
// import VideoPlayer from '@/components/VideoPlayer'; // Maybe remove if only used here
```

### Step 2: Update Ref Declaration (around line 40-50)

**Find:**

```typescript
const playerRef = useRef<any>(null);
```

**Replace with:**

```typescript
const playerRef = useRef<AdaptiveVideoPlayerRef>(null);
```

### Step 3: Add New State Variables (around line 60-80)

**Add after existing state declarations:**

```typescript
// Adaptive streaming states
const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);
const [availableQualities, setAvailableQualities] = useState<HLSQuality[]>([]);
const [networkQuality, setNetworkQuality] = useState<
  "poor" | "fair" | "good" | "excellent"
>("good");
const [showStreamingAnalytics, setShowStreamingAnalytics] = useState(false);
```

### Step 4: Initialize Qualities (add new effect)

**Add this new useEffect hook:**

```typescript
// Initialize available qualities from player
useEffect(() => {
  if (!playerRef.current) return;

  const timer = setTimeout(() => {
    const qualities = playerRef.current?.getAvailableQualities() || [];
    setAvailableQualities(qualities);

    const quality = playerRef.current?.getCurrentQuality();
    if (quality) {
      setCurrentQuality(quality);
    }
  }, 800);

  return () => clearTimeout(timer);
}, []); // Only on mount
```

### Step 5: Replace VideoPlayer Component (around line 390-400)

**Find this section:**

```typescript
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  className="relative w-full max-w-[1200px] aspect-video glass-panel border-border rounded-[2rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] overflow-hidden"
>
  {revision && (
    <VideoPlayer
      ref={playerRef}
      src={(revision as any).hlsUrl || revision.videoUrl}
      onTimeUpdate={handleTimeUpdate}
      onDurationChange={setDuration}
    />
  )}

  {/* Timeline */}
  <div className="absolute bottom-10 left-10 right-10">
    <TimelineComments
      duration={duration}
      comments={comments}
      onSeek={handleSeek}
      hoverTime={hoverTime}
    />
  </div>
</motion.div>
```

**Replace with:**

```typescript
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  className="relative w-full max-w-[1200px] aspect-video glass-panel border-border rounded-[2rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] overflow-hidden"
>
  {revision && (
    <AdaptiveVideoPlayer
      ref={playerRef}
      src={(revision as any).hlsUrl || revision.videoUrl}
      sourceResolution={revision.sourceResolution || '4K'} // Add if available in revision data
      onTimeUpdate={handleTimeUpdate}
      onDurationChange={setDuration}
      onQualityChange={(quality) => {
        setCurrentQuality(quality);
        // Optional: Log quality change
        console.log(`Video quality changed to: ${quality.name}`);
      }}
      onNetworkStateChange={(state) => {
        setNetworkQuality(state);
      }}
      autoQuality={true}
    />
  )}

  {/* Timeline */}
  <div className="absolute bottom-10 left-10 right-10">
    <TimelineComments
      duration={duration}
      comments={comments}
      onSeek={handleSeek}
      hoverTime={hoverTime}
    />
  </div>
</motion.div>
```

### Step 6: Update Download Button Section (around line 330-345)

**Find the download button area and UPDATE this section to include quality info:**

```typescript
{showDownloadButton && (
  <button
    onClick={async () => {
      if (!showPaymentLock) {
        try {
          const res = await registerDownload(params.id, params.revisionId);
          if (!res.success) {
            toast.error(res.error || "Download limit reached");
            return;
          }

          // Optional: Log quality info
          const quality = playerRef.current?.getCurrentQuality();
          console.log(`Downloading at quality: ${quality?.name}`);

          if (revision) setRevision({ ...revision, downloadCount: (revision.downloadCount || 0) + 1 });
          if (res.downloadUrl) {
            await directDownload(res.downloadUrl, `${project?.name || 'video'}_v${revision?.version || 1}.mp4`);
          } else if (revision?.videoUrl) {
            await directDownload(revision.videoUrl, `${project?.name || 'video'}_v${revision?.version || 1}.mp4`);
          }
        } catch (e) {
          toast.error("Download failed.");
        }
      } else {
        handleDownloadAttempt();
      }
    }}
    // ... rest of button props unchanged ...
  >
    {/* Button content unchanged */}
  </button>
)}
```

### Step 7: Update Feedback Controls (around line 435-465)

**Replace the feedback controls section to include quality selector:**

**Original:**

```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.4 }}
  className="mt-14 flex items-center gap-6"
>
  <button
    onClick={handleAddCommentStart}
    className="group h-14 px-10 rounded-2xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-primary/40 text-foreground transition-all active:scale-95 flex items-center gap-4 relative overflow-hidden"
  >
    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
    <MessageSquarePlus className="h-5 w-5 text-primary" />
    <span className="text-[11px] font-black uppercase tracking-[0.2em]">
      {isAddingComment ? "Drafting..." : `Leave a comment at ${Math.floor(currentTime)}s`}
    </span>
  </button>

  <div className="h-10 w-px bg-muted/50" />

  <div className="flex items-center gap-3">
    <button className="h-12 w-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
      <Maximize2 className="h-4 w-4" />
    </button>
    <button
      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      className={cn(
        "h-12 w-12 rounded-xl flex items-center justify-center transition-all border",
        isSidebarOpen ? "bg-primary text-foreground border-primary/20" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {isSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
    </button>
  </div>
</motion.div>
```

**Replace with:**

```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.4 }}
  className="mt-14 flex items-center gap-4 flex-wrap"
>
  <button
    onClick={handleAddCommentStart}
    className="group h-14 px-10 rounded-2xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-primary/40 text-foreground transition-all active:scale-95 flex items-center gap-4 relative overflow-hidden"
  >
    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
    <MessageSquarePlus className="h-5 w-5 text-primary" />
    <span className="text-[11px] font-black uppercase tracking-[0.2em]">
      {isAddingComment ? "Drafting..." : `Leave a comment at ${Math.floor(currentTime)}s`}
    </span>
  </button>

  <div className="h-10 w-px bg-muted/50" />

  {/* Network Status Indicator */}
  <div className="flex items-center gap-2">
    <NetworkStatus
      quality={networkQuality}
      bandwidth={playerRef.current?.getNetworkMetrics?.()?.bandwidth}
      compact={true}
    />
  </div>

  {/* Quality Selector */}
  <QualitySelector
    qualities={availableQualities}
    currentQuality={currentQuality}
    onQualitySelect={(quality) => {
      playerRef.current?.setQuality(quality);
      setCurrentQuality(quality);
    }}
    networkQuality={networkQuality}
    compact={true}
  />

  <div className="h-10 w-px bg-muted/50" />

  <div className="flex items-center gap-3">
    {/* Optional: Analytics Toggle */}
    <button
      onClick={() => setShowStreamingAnalytics(!showStreamingAnalytics)}
      className="h-12 w-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:border-primary/40"
      title="Show streaming analytics"
    >
      <Activity className="h-4 w-4" />
    </button>

    <button className="h-12 w-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
      <Maximize2 className="h-4 w-4" />
    </button>
    <button
      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      className={cn(
        "h-12 w-12 rounded-xl flex items-center justify-center transition-all border",
        isSidebarOpen ? "bg-primary text-foreground border-primary/20" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {isSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
    </button>
  </div>
</motion.div>

{/* Optional: Streaming Analytics Display */}
{showStreamingAnalytics && playerRef.current && (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="mt-8"
  >
    <StreamingAnalytics
      totalBytesTransferred={playerRef.current?.getAnalytics?.()?.totalBytesTransferred || 0}
      averageBitrate={playerRef.current?.getAnalytics?.()?.averageBitrate || 0}
      qualityChangeCount={playerRef.current?.getAnalytics?.()?.qualityChanges?.length || 0}
      rebufferingCount={playerRef.current?.getAnalytics?.()?.rebufferingCount || 0}
      currentQuality={currentQuality}
    />
  </motion.div>
)}
```

### Step 8: Update Imports for New Icons (if needed)

**Find the import from lucide-react and ensure you have:**

```typescript
import {
  ChevronLeft,
  Download,
  ShieldCheck,
  Share2,
  MessageSquarePlus,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Activity, // ADD THIS
  Zap,
} from "lucide-react";
```

## Summary of Changes

| Item                  | Change Type | Details                                                                    |
| --------------------- | ----------- | -------------------------------------------------------------------------- |
| Imports               | Add         | AdaptiveVideoPlayer, QualitySelector, etc.                                 |
| playerRef Type        | Update      | Change from `any` to `AdaptiveVideoPlayerRef`                              |
| State                 | Add         | currentQuality, availableQualities, networkQuality, showStreamingAnalytics |
| UseEffect             | Add         | Initialize available qualities on mount                                    |
| VideoPlayer Component | Replace     | Swap with AdaptiveVideoPlayer                                              |
| Download Handler      | Update      | Optional: Log quality info                                                 |
| Feedback Controls     | Enhance     | Add NetworkStatus and QualitySelector UI                                   |
| Analytics Display     | Add         | Optional: Show streaming analytics                                         |

## Testing After Integration

1. **Start the dev server:**

   ```bash
   npm run dev
   ```

2. **Navigate to a review page:**
   - Go to a project review
   - Check console for errors
   - Verify video plays

3. **Test quality selector:**
   - Click quality dropdown
   - Select different quality
   - Verify selection is applied

4. **Check network indicator:**
   - Should show current network quality
   - Monitor bandwidth detection

5. **Verify analytics (if enabled):**
   - Click analytics button
   - Check displayed metrics

## Rollback Instructions

If you need to rollback to the original VideoPlayer:

1. Import VideoPlayer again
2. Replace AdaptiveVideoPlayer with VideoPlayer
3. Remove the quality-related state
4. Remove the quality selector UI
5. Remove useEffect for qualities

## Notes

- All existing functionality is preserved
- Backward compatible with existing VideoPlayer API
- Optional analytics feature (can be disabled)
- Quality selector only shows if multiple qualities available
- HLS.js fallback to native support if not available
