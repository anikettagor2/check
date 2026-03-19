# Streaming Algorithm Implementation Details

## Algorithm Flowcharts & Implementation Logic

### 1. Main Streaming Flow

```
┌────────────────────────────────────────────────────────────────┐
│ USER INITIATES VIDEO PLAYBACK                                  │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ INITIALIZE STREAMING ENGINE                                    │
│ - Create BandwidthEstimator                                    │
│ - Create BufferManager                                         │
│ - Create AdaptiveBitrateController                             │
│ - Setup event listeners                                        │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ FAST START: PRELOAD FIRST CHUNKS                               │
│ - Load chunk 0 (priority: high)                                │
│ - Parallel: Load chunks 1, 2                                   │
│ - Bandwidth estimation starts                                  │
│ - Target: 1-1.5 seconds until ready                            │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
                    ✓ Chunk 0 loaded?
                    │         │
                    YES       NO → Wait up to 30s
                    │              (show spinner)
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ EMIT: READY_TO_PLAY                                            │
│ - UI enables play button                                       │
│ - Display buffer/quality metrics                               │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
                    USER CLICKS PLAY
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ START PLAYBACK LOOP (every 100ms)                              │
│ - Advance currentTime += 0.1s                                  │
│ - Consume from buffer -= 0.1s                                  │
│ - Check if next chunk needed                                   │
│ - Monitor buffer health                                        │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ QUALITY ADAPTATION LOOP (every 2 seconds)                      │
│ - Estimate bandwidth                                           │
│ - Check buffer health                                          │
│ - Suggest quality (conservative: min(bw, buffer))              │
│ - Request quality change (with rate limiting)                  │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ PREFETCH MANAGEMENT                                            │
│ - If buffer good: prefetch next 2 chunks                       │
│ - Load in current quality                                      │
│ - Parallel prefetching doesn't block playback                  │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓
                    END OF VIDEO?
                    │          │
                    NO         YES → PAUSE
                    │              & EMIT END EVENT
                    ↓
          CONTINUE PLAYBACK
```

---

### 2. Bandwidth Estimation Algorithm Detailed

```
STATE: BandwidthEstimator.samples = []

CHUNK DOWNLOAD EVENT:
  input: bytesReceived, downloadTimeMs

  ┌──────────────────────────────────────────────┐
  │ recordSample(bytes, duration)                │
  └──────────────┬───────────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────────┐
  │ Create sample object:                        │
  │  { timestamp: Date.now(),                    │
  │    bytes: bytes,                             │
  │    duration: duration }                      │
  └──────────────┬───────────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────────┐
  │ Add to samples array                         │
  │ samples.push(sample)                         │
  └──────────────┬───────────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────────┐
  │ CLEANUP: Remove expired samples              │
  │ if (now - sample.timestamp > 20000ms):       │
  │   remove sample (outside window)             │
  └──────────────┬───────────────────────────────┘
                 ↓
  ┌──────────────────────────────────────────────┐
  │ LIMIT: Keep max 10 recent samples            │
  │ if (samples.length > 10):                    │
  │   samples = samples.slice(-10)               │
  └──────────────┬───────────────────────────────┘
                 ↓
GET BANDWIDTH REQUEST:
  estimateBandwidth():
    ┌──────────────────────────────────────────────┐
    │ Calculate weighted average                   │
    │ weight = 1.0 (most recent = highest)         │
    │ weight *= 0.9 for each older sample          │
    │                                              │
    │ For each sample:                             │
    │   totalBytes += sample.bytes * weight        │
    │   totalDuration += sample.duration * weight  │
    │   weight *= 0.9 (decrease for older)        │
    └──────────────┬───────────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────────┐
    │ bandwidth = (totalBytes * 8) /               │
    │            (totalDuration / 1000)            │
    │                                              │
    │ Ensure minimum: max(bandwidth, 100) Kbps     │
    └──────────────┬───────────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────────┐
    │ RECOMMEND QUALITY                            │
    │                                              │
    │ safeBandwidth = bandwidth * 0.8              │
    │ (safety margin = 20%)                        │
    │                                              │
    │ if safeBandwidth >= 3000 Kbps:               │
    │   return 'high'    (720p)                    │
    │ else if >= 1200 Kbps:                        │
    │   return 'medium'  (480p)                    │
    │ else:                                        │
    │   return 'low'     (360p)                    │
    └──────────────────────────────────────────────┘

EXAMPLE EXECUTION:
  Time   Event
  ────────────────────────────────────────
  0ms    Download C0: 500KB in 1000ms
         sample: {timestamp: T0, bytes: 500K, duration: 1000}
         bandwidth = (500K * 8) / 1 = 4000 Kbps → 'high'

  2000ms Download C1: 450KB in 900ms
         sample: {timestamp: T0+2s, bytes: 450K, duration: 900}

         WEIGHTED AVG: (450K*0.9 + 500K*0.81) / (900*0.9 + 1000*0.81)
                     = (405K + 405K) / (810 + 810)
                     = 810K / 1620ms
                     = 4000 Kbps → 'high'

  4000ms Download C2: 350KB in 2000ms (slow!)
         sample: {timestamp: T0+4s, bytes: 350K, duration: 2000}

         WEIGHTED AVG: (350K*0.9 + 450K*0.81 + 500K*0.729)
                     / (2000*0.9 + 900*0.81 + 1000*0.729)
                     = 1076K / 3419ms
                     = 2080 Kbps → 'medium'

         ↓ Suggests downgr
         Quality change request sent to ABR controller
```

---

### 3. Buffer State Machine

```
BUFFER LIFECYCLE:

    INIT (0s)
       ↓
    [Add chunks to buffer]
       ↓
    MINIMUM THRESHOLD: 3s?
    │         │
    NO        YES
    │         │
    ↓         ↓
  WAIT    READY_TO_PLAY
           ├─ Can start playback
           └─ Evaluate health


DURING PLAYBACK:

NORMAL STATE (5-8s)
  ├─ Playback smooth
  ├─ Buffer stable
  ├─ Prefetch enabled
  └─ Current quality OK

        ↑ Network improves
        │
        ↓
  GOOD STATE (8-20s)
  ├─ Excess buffer
  ├─ Safe to upgrade quality
  └─ Next chunks in high bitrate


        ↓ Network degrades
        │
        ↓
  LOW STATE (3-5s)
  ├─ Buffer depleting
  ├─ Prefetch aggressive
  ├─ Suggest medium quality
  └─ Prepare for downgrade


        ↓ Network fails
        │
        ↓
  CRITICAL STATE (<3s)
  ├─ Immediate downgrade
  ├─ Force 'low' quality
  ├─ Aggressive prefetch
  └─ May pause if drops below 0


HEALTH CALCULATION:

bufferedSeconds = 6.5s

Calculate tier:
  if bufferedSeconds < 3:
    health = 'critical'

  else if bufferedSeconds < 5:
    health = 'low'

  else if bufferedSeconds >= 8:
    health = 'good'

  else:
    health = 'normal'

percentFilled = (6.5 / 20) * 100 = 32.5%

Result:
{
  bufferedSeconds: 6.5,
  bufferHealth: 'normal',
  percentFilled: 32.5,
  isBuffering: false
}
```

---

### 4. Adaptive Bitrate Control State Machine

```
QUALITY TRANSITION RULES:

Current: MEDIUM (480p)
  │
  ├─→ Suggest: LOW (bandwidth dropped)
  │   Time since last switch: 1s (< 3s minimum)
  │   Is downgrade: YES
  │   Action: APPLY IMMEDIATELY (urgent)
  │   Reason: Prevent rebuffering (continuity > quality)
  │   Result: Switch to LOW
  │
  ├─→ Suggest: HIGH (bandwidth good)
  │   Time since last switch: 0.5s (< 3s minimum)
  │   Buffer health: GOOD
  │   Action: DEFER (queue for later)
  │   Reason: Prevent oscillation
  │   Result: Keep MEDIUM, try again in 2.5s
  │
  └─→ Suggest: HIGH (bandwidth good)
      Time since last switch: 5s (> 3s)
      Buffer health: GOOD
      Stability: 5000ms+ of good conditions
      Action: APPLY (safe to upgrade)
      Result: Switch to HIGH


QUALITY OSCILLATION PREVENTION:

Scenario: Network fluctuates between 1-3 Mbps

Without protection:
  T=0s:   Bandwidth 2.5M → Recommend MEDIUM → Switch to MEDIUM
  T=0.5s: Bandwidth 1.0M → Recommend LOW    → Switch to LOW
  T=1.0s: Bandwidth 2.8M → Recommend MEDIUM → Switch to MEDIUM
  T=1.5s: Bandwidth 0.8M → Recommend LOW    → Switch to LOW
  ↓
  FLAPPING: User sees constant quality changes ❌


With 3s minimum interval + stability counter:
  T=0s:   Bandwidth 2.5M → Switch to MEDIUM (t=0, first)
  T=0.5s: Bandwidth 1.0M → Can't switch (0.5 < 3s min)
          Queue: RECOMMEND_LOW
  T=1.0s: Bandwidth 2.8M → Still in 3s window, ignore
  T=1.5s: Bandwidth 2.7M → Still in 3s window, ignore
  T=3.0s: Bandwidth 2.6M → Can switch, queue says LOW
          But buffer good, stability > 5s → Stay MEDIUM
  T=5.0s: Bandwidth 2.8M, Buffer good
          → Can upgrade to HIGH → Switch to HIGH
  ↓
  STABLE: User sees smooth, infrequent changes ✓


UPGRADE LOGIC:

For each quality level:

  Current: LOW
  │
  ├─ Can upgrade to? MEDIUM
  │  Requires: bandwidth >= 1.2 Mbps ✓
  │  Requires: buffer >= NORMAL ✓
  │  Requires: stability >= 5s ✓
  │  Requires: MinSwitchInterval >= 3s ✓
  │  → UPGRADE ALLOWED
  │
  └─ Can upgrade to? HIGH
     Requires: bandwidth >= 3.0 Mbps ✗ (only 1.2)
     → UPGRADE BLOCKED


DOWNGRADE LOGIC (ALWAYS URGENT):

  Network drops to 500 Kbps
  Current quality: HIGH
  Recommended: LOW

  Time since last switch: 0.5s (< 3s)

  Is downgrade: YES
  Action: BYPASS minimum interval
  Apply immediately: YES → Switch to LOW

  Reason: Downgrade is always OK because:
    - Prevents rebuffering
    - Continuity > image quality
    - Does not cause oscillation
      (only goes down when network actually bad)
```

---

### 5. Chunk Loading & Prefetching

```
CHUNK LOADING SEQUENCE:

T=0ms:  User presses PLAY
        ├─ Current chunk: 0
        ├─ Load C0 (priority: CRITICAL)
        └─ Parallel: Start C1, C2 fetch

T=500ms: C0 received (100KB @ 360p)
         ├─ Add to buffer: 3s
         ├─ Record bandwidth sample: 200KB/500ms → 3200 Kbps
         └─ Emit CHUNK_LOADED → UI ready to play

T=600ms: User clicks PLAY
         ├─ Start playback simulation
         ├─ Begin consuming buffer: 0.1s per 100ms
         └─ Start quality adaptation loop

T=800ms: C1 received (150KB)
         ├─ Add to buffer: 3s (now 5+ seconds buffered)
         └─ shouldPrefetch() = true → Queue C3

T=1000ms: C2 received (180KB)
          ├─ Add to buffer: 3s (now 8+ seconds buffered)
          ├─ Buffer health: GOOD
          ├─ Prefetch enabled
          └─ Queue: C4, C5

T=1500ms: Playback at 1.5s
          ├─ Buffer consumed: 0.9s
          ├─ Current buffer: 7.1s
          ├─ Load queue: C3 → fetch
          └─ Expected load time: 500-1000ms

T=3000ms: Playback at 3.0s
          ├─ Current chunk changing: C0 → C1
          ├─ Consumed: 3.0s
          ├─ C1 ready (already loaded)
          ├─ Buffer: 5.1s (consumed C0)
          └─ Continue playback smoothly


PREFETCH TIMING:

Buffer strategy: Always keep 2 chunks ahead of playback

                 Playback head
                      ↓
    ┌────┬────┬────┬────┬────┬────┬────┐
    │ C0 │ C1 │ C2 │ C3 │ C4 │ C5 │ C6 │
    └────┴────┴────┴────┴────┴────┴────┘
    ↓                         ↓
  Loaded & Playing      Prefetch Window
    (consumed)           (load ahead)


Trigger prefetch when:
  1. loadedChunks.size % preloadCount == 0
  2. bufferManager.shouldPrefetch() == true
  3. Buffer health == 'normal' || 'good'

Algorithm: schedulePrefetch()
  ├─ nextIndex = currentChunk + 1
  ├─ For i = 0 to preloadCount-1:
  │   ├─ Check if chunk (nextIndex + i) loaded
  │   ├─ If not loaded AND not loading:
  │   │   loadChunk(nextIndex + i)
  │   └─ Add to loadingChunks set
  └─ Monitor load progress
```

---

### 6. Seamless Quality Switch Mechanism

```
QUALITY SWITCH AT CHUNK BOUNDARY:

Before switch (current chunk 480p):
  ┌────────────────────┐
  │ Chunk N-1 (480p)   │ ← Already decoded & discarded
  └────────────────────┘
  ┌────────────────────┐
  │ Chunk N (480p)     │ ← Currently playing
  └────────────────────┘ ← Chunk boundary HERE
  ┌────────────────────┐
  │ Chunk N+1 (480p)   │ ← Queued to play next
  └────────────────────┘ ← But loaded as 480p

After ABR decision: Switch to 720p
  ├─ currentQuality = HIGH (720p)
  ├─ requestedQuality = HIGH
  └─ Next setChunk will fetch in new quality

When N+1 loads:
  ├─ Fetch as 720p instead of 480p
  ├─ Bitrate: 3.5 Mbps (larger chunk, ~980KB)
  ├─ Duration: still 3s
  ├─ Codec: still H.264 (same)
  ├─ Resolution: 720x480 (different, but handled by player)
  └─ Quality switch applied!


RESULT: No visible transition
  - No pause/buffering at quality switch
  - No audio-video de-sync
  - No codec re-initialization
  - Seamless user experience ✓


KEY INSIGHT:
  Chunk boundary = Quality switch point

  Switching quality between chunks means:
    ✓ Different size next time around
    ✓ Same format & codec
    ✓ Same metadata
    ✓ Transparent to playback
```

---

### 7. Real-Time Quality Decision Making

```
QUALITY DECISION LOOP (runs every 2 seconds):

Step 1: GATHER METRICS
  ├─ bandwidthInfo = bandwidthEstimator.getBandwidthInfo()
  │  ├─ bandwidthKbps: 1850
  │  ├─ recommended: 'medium'
  │  └─ sampleCount: 8
  │
  └─ bufferState = bufferManager.getBufferState()
     ├─ bufferedSeconds: 6.2
     ├─ bufferHealth: 'normal'
     ├─ isBuffering: false
     └─ percentFilled: 31


Step 2: GET QUALITY SUGGESTIONS
  ├─ bwQuality = bandwidthEstimator.getRecommendedBitrate()
  │  └─ 'medium' (1850 Kbps * 0.8 = 1480 Kbps safe)
  │
  └─ bufferQuality = bufferManager.getQualityRecommendation()
     └─ 'medium' (buffer 'normal' → medium safe)


Step 3: CONSERVATIVE SELECTION
  ├─ Compare quality values:
  │  ├─ bwQuality = 2 ('medium')
  │  └─ bufferQuality = 2 ('medium')
  │
  ├─ Pick MIN for safety:
  │  └─ suggested = 'medium'
  │
  └─ If different:
     └─ Always pick lower to prevent rebuffering


Step 4: REQUEST QUALITY CHANGE
  ├─ abrController.requestQualityChange(quality)
  │  ├─ Check time since last switch ≥ 3s
  │  ├─ Check if downgrade (always allowed)
  │  └─ Apply if conditions met
  │
  └─ If applied:
     ├─ Emit QUALITY_CHANGED event
     ├─ Log switch details
     └─ Next prefetch in new quality


Step 5: UPDATE UI (if connected)
  ├─ Display current quality
  ├─ Display buffer health
  ├─ Display bandwidth
  └─ Display status indicator


EXAMPLE FLOW:

  T=10s  BW=3500K, Buffer=8.5s (GOOD)
         → Suggest HIGH, Buffer says MEDIUM
         → Suggested: MEDIUM (conservative)
         → Current: MEDIUM → No change

  T=12s  BW=2800K, Buffer=8.2s (GOOD)
         → Suggest HIGH, Buffer says MEDIUM
         → Suggested: MEDIUM
         → Current: MEDIUM → No change

  T=14s  BW=2500K, Buffer=7.9s (NORMAL)
         → Suggest MEDIUM, Buffer says MEDIUM
         → Suggested: MEDIUM
         → Current: MEDIUM → No change
         → Quality stable, continue

  T=15s  Network drops (connection issue)
  T=16s  BW=800K, Buffer=5.2s (LOW)
         → Suggest LOW, Buffer says MEDIUM
         → Suggested: LOW (emergency downgrade)
         → Current: MEDIUM → DOWNGRADE ALLOWED
         → Switch to LOW immediately @ T=16s
         → Prevents buffer from going critical

  T=18s  BW=1200K, Buffer=7.1s (NORMAL)
         → Suggest MEDIUM, Buffer says MEDIUM
         → Suggested: MEDIUM
         → But can we upgrade from LOW?
         → Last switch: 2s ago (< 3s minimum)
         → Don't upgrade yet, wait

  T=19s  Still in 3s minimum window → No upgrade

  T=20.5s Time since switch: 4.5s (> 3s)
         BW=1800K, Buffer=8.5s (GOOD)
         → Suggest MEDIUM, Buffer says MEDIUM
         → Suggested: MEDIUM
         → Upgrade? From LOW to MEDIUM
         → Requires: stability, good buffer
         → Yes! Switch to MEDIUM @ T=20.5s
```

---

### 8. Startup Delay Optimization

```
EARLY LOAD STRATEGY:

┌─────────────────────────────────────────────┐
│ T=0ms: User clicks PLAY (or page loads)     │
└─────────────────────┬───────────────────────┘
                      │
        Initialize streaming engine
                      │
        ┌─────────────┴──────────────┬─────────────┐
        │                            │             │
        ↓                            ↓             ↓
    Load C0         Load C1         Load C2
  (Critical)      (Prefetch)      (Prefetch)
    [100KB]         [150KB]         [180KB]
  Duration: 1s    Duration: 0.9s   Duration: 0.8s



┌─────────────────────────────────────────────┐
│ T=300ms: C0 loaded                          │
│ Chunk duration: 3s                          │
│ Add to buffer: 3s                           │
│ isReady: true (meets minBuffer threshold)   │
└─────────────────────┬───────────────────────┘
                      │
        Emit: READY_TO_PLAY
   (UI shows play button)
                      │
┌─────────────────────────────────────────────┐
│ T=500ms: User clicks PLAY                   │
│ (or already playing if autoPlay enabled)    │
└─────────────────────┬───────────────────────┘
                      │
        Start playback @ T=0
        ├─ currentTime = 0s
        ├─ isPlaying = true
        └─ Begin consuming buffer
                      │
┌─────────────────────────────────────────────┐
│ Continue prefetch in background             │
│ T=600ms: C1 loaded                          │
│ T=700ms: C2 loaded                          │
│ Total buffered: 9 seconds before any play   │
└─────────────────────────────────────────────┘


STARTUP METRICS:

Manual decision         Auto-play (adaptive)
──────────────────────────────────────────
T=0:    Initialize      T=0:   Initialize
T=300:  Ready           T=300: Ready
T=500:  User clicks     T=300: Auto-play
T=501:  Playback        T=301: Playback starts

Manual delay:  501ms     Auto-play: 301ms
Advantage:     User controls refresh, predictable

Auto-play advantage:     Faster start (parallel prefetch)
Risk:                    May start with limited buffer


OPTIMIZATION: Parallel HTTP Requests

Instead of sequential:
  C0 → Wait → C1 → Wait → C2
  Total: ~2.8 seconds

Use parallel:
  C0 ┐
  C1 ├─ Concurrent
  C2 ┘

  Fastest single: 1s
  Total: ~1.2s with TCP pipelining

Modern HTTP/2:
  - Multiplexing multiple streams
  - Single connection, parallel transfers
  - HTTP/2 Server Push: Server sends C1, C2 unsolicited
    └─ Can preempt next chunk prediction
```

---

### 9. Error Handling & Recovery

```
ERROR RECOVERY STRATEGY:

CHUNK FETCH FAILURE:

1st attempt: Fetch C3 @ 480p
  └─ Error: Network timeout
  └─ Action: Queue retry in 500ms

Retry 1 (T+500ms):
  └─ Fetch C3 @ 480p again
  └─ Error: Still timeout
  └─ Action: Queue retry in 1s, consider downgrade

Retry 2 (T+1.5s):
  └─ Fetch C3 @ 360p (lower quality)
  └─ Success: Chunk loads
  └─ Action: Keep low quality for next chunks

Recovery phase:
  └─ Monitor bandwidth
  └─ After 5s stability, try upgrade


CODE IMPLEMENTATION:

async loadChunk(chunkIndex) {
    attempt = 0
    maxAttempts = 4

    while (attempt < maxAttempts) {
        try:
            data = await fetchChunkWithRange(...)
            recordSuccess()
            return data

        catch (error):
            attempt++

            if (attempt < 2):
                // Fast retry: same quality
                await sleep(500ms * attempt)
                continue

            else if (attempt < 3):
                // Quality downgrade
                qualityLevel--
                await sleep(1000ms)
                continue

            else:
                // Last chance: lowest quality
                qualityLevel = 'low'
                await sleep(2000ms)
                continue
    }

    // All attempts exhausted
    throw Error("Failed to load chunk")
}


GRACEFUL DEGRADATION:

Content unavailable @ 720p?
  → Try 480p
  → Try 360p
  → Try proxy/fallback
  → Pause & notify user


Network error pattern detection:

ISP level:  Blocks high bitrate
  → Detect failed 720p, 480p
  → Stick to 360p automatically

Regional:   High latency to CDN edge
  → Detect slow C0 fetch
  → Increase buffer threshold (wait for more prefetch)

Peak hours: Network congestion
  → Monitor trending down
  → Autodetect degradation trend
  → Preemptively drop quality
```

---

## Summary: Complete Streaming Flow

```
User clicks play
  ↓
Initialize streaming engine
  ├─ BandwidthEstimator: Reset, ready to track
  ├─ BufferManager: Ready to monitor
  ├─ ABRController: Start at 'medium' quality
  └─ EventSystem: Ready to emit events
  ↓
Prefetch C0, C1, C2 in parallel
  ├─ C0 arrives: 3s buffer
  ├─ C1 arrives: 6s buffer
  └─ C2 arrives: 9s buffer
  ↓
Emit READY_TO_PLAY (when C0 loaded)
  ↓
Playback starts (when user clicks or auto-play)
  ├─ currentTime advances
  ├─ buffer shrinks
  └─ Metrics update every 500ms
  ↓
Every 2 seconds: Adapt quality
  ├─ Estimate bandwidth
  ├─ Check buffer health
  ├─ Select conservative quality
  └─ Request switch (if needed)
  ↓
Every 100ms: Check chunk availability
  ├─ Is next chunk loaded?
  ├─ Yes: Continue playback
  └─ No: Speed up prefetch
  ↓
Prefetch management (continuous)
  ├─ If buffer >= normal: prefetch 2 chunks
  ├─ If buffer < normal: prioritize current chunk
  └─ Chunks load in current quality
  ↓
Handle user interactions
  ├─ Pause: Stop playback loop
  ├─ Resume: Restart playback loop
  ├─ Seek: Reload buffer, clear old chunks
  └─ Continue playback from new position
  ↓
Monitor for errors
  ├─ Chunk fetch fails: Retry with backoff
  ├─ Buffer critical: Force quality drop
  ├─ Network down: Pause, show buffering
  └─ Errors emit to UI
  ↓
Reaching end of video
  ├─ currentTime > duration
  ├─ Stop playback
  └─ Emit END event
  ↓
Cleanup on unmount
  ├─ Cancel pending fetches
  ├─ Clear timers
  ├─ Unsubscribe events
  └─ Destroy engine instance
```

This ensures smooth, buffering-free playback through intelligent adaptation at every level.
