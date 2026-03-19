'use client';

/**
 * Example Integration: Adaptive Video Streaming in Review Page
 * This file shows how to integrate adaptive streaming into the review page
 *
 * Copy patterns from this file to integrate into your actual review page
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import AdaptiveVideoPlayer, { AdaptiveVideoPlayerRef } from '@/components/streaming/adaptive-video-player';
import { QualitySelector, NetworkStatus, StreamingAnalytics } from '@/components/streaming/quality-selector';
import { HLSQuality } from '@/lib/streaming/hls-quality-manager';

interface ExampleReviewPageProps {
  videoUrl: string;
  hlsUrl?: string;
  sourceResolution?: string;
}

/**
 * Example component showing adaptive streaming integration
 */
export const AdaptiveVideoReviewExample: React.FC<ExampleReviewPageProps> = ({
  videoUrl,
  hlsUrl,
  sourceResolution = '1080p',
}) => {
  // Refs
  const playerRef = useRef<AdaptiveVideoPlayerRef>(null);

  // States for quality management
  const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);
  const [availableQualities, setAvailableQualities] = useState<HLSQuality[]>([]);
  const [networkQuality, setNetworkQuality] = useState<'poor' | 'fair' | 'good' | 'excellent'>('good');
  
  // States for playback
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // States for analytics
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);

  // Initialize available qualities from player
  useEffect(() => {
    const timer = setTimeout(() => {
      if (playerRef.current) {
        const qualities = playerRef.current.getAvailableQualities();
        setAvailableQualities(qualities);
        
        const initialQuality = playerRef.current.getCurrentQuality();
        if (initialQuality) {
          setCurrentQuality(initialQuality);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  /**
   * Handle time update
   */
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  /**
   * Handle duration change
   */
  const handleDurationChange = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  /**
   * Handle quality change
   */
  const handleQualityChange = useCallback((quality: HLSQuality) => {
    setCurrentQuality(quality);
    console.log(`Quality changed to: ${quality.name}`);
  }, []);

  /**
   * Handle network state change
   */
  const handleNetworkStateChange = useCallback((state: 'poor' | 'fair' | 'good' | 'excellent') => {
    setNetworkQuality(state);
  }, []);

  /**
   * Handle quality selection from UI
   */
  const handleQualitySelect = useCallback((quality: HLSQuality) => {
    if (playerRef.current) {
      playerRef.current.setQuality(quality);
      setCurrentQuality(quality);
    }
  }, []);

  /**
   * Seek to time
   */
  const handleSeek = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time);
    }
  }, []);

  /**
   * Update analytics display
   */
  const updateAnalytics = useCallback(() => {
    if (playerRef.current) {
      setAnalytics(playerRef.current.getAnalytics());
    }
  }, []);

  /**
   * Format time
   */
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const src = hlsUrl || videoUrl;

  return (
    <div className="flex flex-col gap-6 p-6 bg-background rounded-lg">
      {/* Video Player Section */}
      <div className="rounded-xl overflow-hidden bg-black aspect-video shadow-lg">
        <AdaptiveVideoPlayer
          ref={playerRef}
          src={src}
          sourceResolution={sourceResolution}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onQualityChange={handleQualityChange}
          onNetworkStateChange={handleNetworkStateChange}
          autoQuality={true}
        />
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Timeline */}
        <div className="flex items-center gap-4 flex-1">
          <span className="text-xs font-mono text-muted-foreground">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-muted rounded-full appearance-none"
          />
          <span className="text-xs font-mono text-muted-foreground">{formatTime(duration)}</span>
        </div>

        {/* Quality Selector */}
        <QualitySelector
          qualities={availableQualities}
          currentQuality={currentQuality}
          onQualitySelect={handleQualitySelect}
          networkQuality={networkQuality}
          showBitrate={true}
          compact={false}
        />

        {/* Analytics Button */}
        <button
          onClick={() => {
            updateAnalytics();
            setShowAnalytics(!showAnalytics);
          }}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          {showAnalytics ? 'Hide' : 'Show'} Analytics
        </button>
      </div>

      {/* Network Status */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-bold text-muted-foreground uppercase">Network:</span>
        <NetworkStatus
          quality={networkQuality}
          bandwidth={playerRef.current?.getNetworkMetrics().bandwidth}
          compact={true}
        />
      </div>

      {/* Analytics Section */}
      {showAnalytics && analytics && (
        <StreamingAnalytics
          totalBytesTransferred={analytics.totalBytesTransferred}
          averageBitrate={analytics.averageBitrate}
          qualityChangeCount={analytics.qualityChanges?.length || 0}
          rebufferingCount={analytics.rebufferingCount}
          currentQuality={currentQuality}
        />
      )}

      {/* Quality Changes Timeline */}
      {showAnalytics && analytics?.qualityChanges?.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-widest">Quality Changes</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {analytics.qualityChanges.map((change: any, idx: number) => (
              <div key={idx} className="text-xs flex items-center justify-between p-2 rounded bg-muted/50">
                <span className="text-muted-foreground">
                  {change.fromQuality ? change.fromQuality.name : 'Start'} → {change.toQuality.name}
                </span>
                <span className="text-muted-foreground">
                  {change.reason} • {new Date(change.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-bold text-foreground mb-2 uppercase tracking-widest">How it works</h4>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Video quality automatically adjusts based on your network bandwidth</li>
          <li>• Use the Quality selector to manually choose a quality</li>
          <li>• Current network quality is shown in the Network badge</li>
          <li>• View analytics to see streaming performance details</li>
          <li>• Higher quality requires better network connection</li>
        </ul>
      </div>
    </div>
  );
};

export default AdaptiveVideoReviewExample;
