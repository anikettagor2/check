'use client';

/**
 * Quality Selector Component
 * Displays available video qualities and allows manual quality selection
 */

import React, { useState, useEffect } from 'react';
import { Settings2, Check } from 'lucide-react';
import { HLSQuality } from '@/lib/streaming/hls-quality-manager';

interface QualitySelectorProps {
  qualities: HLSQuality[];
  currentQuality: HLSQuality | null;
  onQualitySelect: (quality: HLSQuality) => void;
  networkQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  recommendedQuality?: HLSQuality;
  showBitrate?: boolean;
  compact?: boolean;
}

/**
 * QualitySelector Component
 * Shows available quality options with current selection
 */
export const QualitySelector: React.FC<QualitySelectorProps> = ({
  qualities,
  currentQuality,
  onQualitySelect,
  networkQuality,
  recommendedQuality,
  showBitrate = true,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (qualities.length <= 1) {
    return null; // Don't show selector if only one quality
  }

  const handleSelect = (quality: HLSQuality) => {
    onQualitySelect(quality);
    setIsOpen(false);
  };

  const networkQualityColor: Record<string, string> = {
    poor: 'text-red-500',
    fair: 'text-yellow-500',
    good: 'text-green-500',
    excellent: 'text-emerald-500',
  };

  const formatBitrate = (bitrate: number): string => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    } else if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(0)} Kbps`;
    }
    return `${bitrate} bps`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{currentQuality?.name || 'Auto'}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 border border-border hover:border-primary/40 hover:bg-muted/70 transition-all"
      >
        <Settings2 className="h-5 w-5 text-primary" />
        <div className="text-left">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Quality</div>
          <div className="text-sm font-semibold text-foreground">{currentQuality?.name || 'Auto'}</div>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 z-50 rounded-xl bg-background/95 backdrop-blur-2xl border border-border shadow-xl overflow-hidden">
          {/* Network Status */}
          {networkQuality && (
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Network</span>
                <span className={`text-xs font-bold uppercase tracking-widest ${networkQualityColor[networkQuality]}`}>
                  {networkQuality}
                </span>
              </div>
            </div>
          )}

          {/* Quality Options */}
          <div className="py-2 space-y-1 max-h-96 overflow-y-auto">
            {qualities.map((quality) => {
              const isSelected = currentQuality?.level === quality.level;
              const isRecommended = recommendedQuality?.level === quality.level;

              return (
                <button
                  key={quality.level}
                  onClick={() => handleSelect(quality)}
                  className={`w-full px-4 py-3 flex items-center justify-between text-left transition-all ${
                    isSelected
                      ? 'bg-primary/20 border-l-2 border-l-primary'
                      : 'hover:bg-muted/50 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{quality.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                      {isRecommended && !isSelected && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded font-semibold border border-emerald-500/30">
                          Recommended
                        </span>
                      )}
                    </div>
                    {showBitrate && (
                      <div className="text-xs text-muted-foreground">{formatBitrate(quality.bitrate)}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">
                    {quality.frameRate}fps
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info */}
          <div className="px-4 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            Higher quality requires better network connection
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Network Status Indicator Component
 * Shows current bandwidth and connection quality
 */
interface NetworkStatusProps {
  bandwidth?: number;
  quality?: 'poor' | 'fair' | 'good' | 'excellent';
  latency?: number;
  compact?: boolean;
}

export const NetworkStatus: React.FC<NetworkStatusProps> = ({ bandwidth, quality = 'good', latency, compact = false }) => {
  const qualityColor: Record<string, string> = {
    poor: 'bg-red-500/20 text-red-500 border-red-500/30',
    fair: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
    good: 'bg-green-500/20 text-green-500 border-green-500/30',
    excellent: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  };

  const formatBandwidth = (bps: number): string => {
    if (bps >= 1000000) {
      return `${(bps / 1000000).toFixed(1)} Mbps`;
    } else if (bps >= 1000) {
      return `${(bps / 1000).toFixed(0)} Kbps`;
    }
    return `${bps} bps`;
  };

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${qualityColor[quality]}`}
      >
        <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
        {quality}
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${qualityColor[quality]}`}>
      <div className="grid grid-cols-2 gap-4">
        {bandwidth && (
          <div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-70">Bandwidth</div>
            <div className="text-lg font-bold mt-1">{formatBandwidth(bandwidth)}</div>
          </div>
        )}
        {latency && (
          <div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-70">Latency</div>
            <div className="text-lg font-bold mt-1">{latency}ms</div>
          </div>
        )}
        <div className="col-span-2">
          <div className="text-xs font-bold uppercase tracking-widest opacity-70">Connection</div>
          <div className="text-lg font-bold mt-1 capitalize flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
            {quality}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Streaming Analytics Component
 * Shows detailed streaming performance metrics
 */
interface StreamingAnalyticsProps {
  totalBytesTransferred?: number;
  averageBitrate?: number;
  qualityChangeCount?: number;
  rebufferingCount?: number;
  currentQuality?: HLSQuality | null;
}

export const StreamingAnalytics: React.FC<StreamingAnalyticsProps> = ({
  totalBytesTransferred = 0,
  averageBitrate = 0,
  qualityChangeCount = 0,
  rebufferingCount = 0,
  currentQuality,
}) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatBitrate = (bps: number): string => {
    if (bps >= 1000000) {
      return `${(bps / 1000000).toFixed(1)} Mbps`;
    } else if (bps >= 1000) {
      return `${(bps / 1000).toFixed(0)} Kbps`;
    }
    return `${bps} bps`;
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-widest">Streaming Analytics</h4>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {currentQuality && (
          <div>
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Quality</div>
            <div className="text-sm font-bold text-foreground mt-1">{currentQuality.name}</div>
          </div>
        )}

        {averageBitrate > 0 && (
          <div>
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Avg Bitrate</div>
            <div className="text-sm font-bold text-foreground mt-1">{formatBitrate(averageBitrate)}</div>
          </div>
        )}

        {totalBytesTransferred > 0 && (
          <div>
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Transferred</div>
            <div className="text-sm font-bold text-foreground mt-1">{formatBytes(totalBytesTransferred)}</div>
          </div>
        )}

        {qualityChangeCount > 0 && (
          <div>
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Quality Changes</div>
            <div className="text-sm font-bold text-foreground mt-1">{qualityChangeCount}</div>
          </div>
        )}

        {rebufferingCount > 0 && (
          <div>
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Rebuffering</div>
            <div className="text-sm font-bold text-red-500 mt-1">{rebufferingCount}x</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QualitySelector;
