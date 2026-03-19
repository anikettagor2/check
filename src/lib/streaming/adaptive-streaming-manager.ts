/**
 * Adaptive Streaming Manager
 * Orchestrates bandwidth detection, quality management, and streaming optimization
 */

import { getBandwidthDetector, NetworkQualityMetrics } from './bandwidth-detector';
import HLSQualityManager, { HLSQuality } from './hls-quality-manager';

export interface AdaptiveStreamingConfig {
  enableAutoQuality: boolean;
  minimumQuality?: HLSQuality;
  maximumQuality?: HLSQuality;
  qualityChangeThreshold: number; // percentage of bandwidth change to trigger quality change
  bufferingThreshold: number; // seconds of buffer to maintain
  rebufferingThreshold: number; // seconds of buffer before rebuffering
  trackAnalytics: boolean;
}

export interface StreamingAnalytics {
  startTime: number;
  totalBytesTransferred: number;
  totalBufferingTime: number;
  qualityChanges: Array<{
    timestamp: number;
    fromQuality: HLSQuality | null;
    toQuality: HLSQuality;
    reason: 'bandwidth' | 'manual' | 'initialization';
  }>;
  averageBitrate: number;
  averageQuality: HLSQuality | null;
  rebufferingCount: number;
  abandonmentTime?: number; // When user left the stream
}

export type StreamingEventType =
  | 'quality-change'
  | 'buffering-start'
  | 'buffering-end'
  | 'rebuffering'
  | 'error'
  | 'network-change';

export interface StreamingEvent {
  type: StreamingEventType;
  timestamp: number;
  data: any;
}

class AdaptiveStreamingManager {
  private config: AdaptiveStreamingConfig;
  private qualityManager: HLSQualityManager;
  private bandwidthDetector = getBandwidthDetector();
  private currentBitrate: number = 0;
  private lastQualityChangeTime: number = 0;
  private lastBandwidth: number = 0;
  private analytics: StreamingAnalytics;
  private eventListeners: Set<(event: StreamingEvent) => void> = new Set();
  private unsubscribeListeners: (() => void)[] = [];
  private bufferingState = false;

  constructor(sourceResolution: string = '1080p', config?: Partial<AdaptiveStreamingConfig>) {
    this.qualityManager = new HLSQualityManager(sourceResolution);

    this.config = {
      enableAutoQuality: true,
      qualityChangeThreshold: 20, // 20% change required
      bufferingThreshold: 8,
      rebufferingThreshold: 3,
      trackAnalytics: true,
      ...config,
    };

    this.analytics = {
      startTime: Date.now(),
      totalBytesTransferred: 0,
      totalBufferingTime: 0,
      qualityChanges: [],
      averageBitrate: 0,
      averageQuality: null,
      rebufferingCount: 0,
    };

    this.setupBandwidthMonitoring();
  }

  /**
   * Setup bandwidth monitoring and auto quality adjustment
   */
  private setupBandwidthMonitoring() {
    const unsubscribe = this.bandwidthDetector.onMetricsChange((metrics) => {
      this.handleNetworkMetrics(metrics);
    });
    this.unsubscribeListeners.push(unsubscribe);
  }

  /**
   * Handle network metrics changes
   */
  private handleNetworkMetrics(metrics: NetworkQualityMetrics) {
    const { bandwidth, quality: networkQuality } = metrics;

    // Track network change event
    if (Math.abs(bandwidth - this.lastBandwidth) / this.lastBandwidth > this.config.qualityChangeThreshold / 100) {
      this.emit('network-change', {
        previousBandwidth: this.lastBandwidth,
        currentBandwidth: bandwidth,
        networkQuality,
      });
    }

    this.lastBandwidth = bandwidth;

    // Auto-adjust quality if enabled
    if (this.config.enableAutoQuality) {
      this.autoAdjustQuality(bandwidth);
    }
  }

  /**
   * Automatically adjust quality based on bandwidth
   */
  private autoAdjustQuality(bandwidth: number) {
    const recommendedQuality = this.qualityManager.getQualityForBandwidth(bandwidth);
    const currentQuality = this.qualityManager.getCurrentQuality();

    if (!currentQuality || recommendedQuality.level !== currentQuality.level) {
      this.setQuality(recommendedQuality, 'bandwidth');
    }
  }

  /**
   * Set quality (manual or automatic)
   */
  public setQuality(quality: HLSQuality, reason: 'bandwidth' | 'manual' | 'initialization' = 'manual') {
    const now = Date.now();

    // Don't allow quality changes more than once per 10 seconds
    if (now - this.lastQualityChangeTime < 10000) {
      return;
    }

    const previousQuality = this.qualityManager.getCurrentQuality();
    this.qualityManager.setQuality(quality);
    this.lastQualityChangeTime = now;

    // Track analytics
    this.analytics.qualityChanges.push({
      timestamp: now,
      fromQuality: previousQuality,
      toQuality: quality,
      reason,
    });

    this.emit('quality-change', {
      quality,
      reason,
      previousQuality,
      bandwidth: this.lastBandwidth,
    });
  }

  /**
   * Get current quality
   */
  public getCurrentQuality(): HLSQuality | null {
    return this.qualityManager.getCurrentQuality();
  }

  /**
   * Get available qualities
   */
  public getAvailableQualities(): HLSQuality[] {
    return this.qualityManager.getAvailableQualities();
  }

  /**
   * Get current bandwidth metrics
   */
  public getNetworkMetrics(): NetworkQualityMetrics {
    return this.bandwidthDetector.getMetrics();
  }

  /**
   * Update bytes transferred (for analytics)
   */
  public recordBytesTransferred(bytes: number) {
    this.analytics.totalBytesTransferred += bytes;
  }

  /**
   * Record buffering start
   */
  public recordBufferingStart() {
    if (!this.bufferingState) {
      this.bufferingState = true;
      this.emit('buffering-start', {});
    }
  }

  /**
   * Record buffering end
   */
  public recordBufferingEnd() {
    if (this.bufferingState) {
      this.bufferingState = false;
      this.emit('buffering-end', {});
    }
  }

  /**
   * Record rebuffering event (buffering after playback started)
   */
  public recordRebuffering() {
    this.analytics.rebufferingCount++;
    this.emit('rebuffering', {
      count: this.analytics.rebufferingCount,
    });
  }

  /**
   * Record error
   */
  public recordError(error: Error | string) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    this.emit('error', {
      error: errorMessage,
      timestamp: Date.now(),
    });
  }

  /**
   * Get streaming analytics
   */
  public getAnalytics(): StreamingAnalytics {
    const now = Date.now();
    const duration = (now - this.analytics.startTime) / 1000; // in seconds

    // Calculate average quality
    if (this.analytics.qualityChanges.length > 0) {
      const lastChange = this.analytics.qualityChanges[this.analytics.qualityChanges.length - 1];
      this.analytics.averageQuality = lastChange.toQuality;
    }

    // Calculate average bitrate
    if (duration > 0) {
      this.analytics.averageBitrate = Math.round((this.analytics.totalBytesTransferred * 8) / duration);
    }

    return { ...this.analytics };
  }

  /**
   * Subscribe to streaming events
   */
  public onStreamingEvent(callback: (event: StreamingEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  private emit(type: StreamingEventType, data: any) {
    const event: StreamingEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    this.eventListeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in streaming event listener:', error);
      }
    });
  }

  /**
   * Get recommendation for initial quality
   */
  public getInitialQualityRecommendation(viewportHeight: number): HLSQuality {
    const metrics = this.bandwidthDetector.getMetrics();
    return this.qualityManager.getRecommendedQuality(metrics.bandwidth, viewportHeight);
  }

  /**
   * Check if rebuffering should occur
   */
  public shouldStartRebuffering(currentBuffer: number): boolean {
    return currentBuffer < this.config.rebufferingThreshold;
  }

  /**
   * Get time until next quality should be adjusted
   */
  public getQualityAdjustmentCooldown(): number {
    const timeSinceLastChange = Date.now() - this.lastQualityChangeTime;
    return Math.max(0, 10000 - timeSinceLastChange); // 10 second cooldown
  }

  /**
   * Cleanup resources
   */
  public destroy() {
    this.unsubscribeListeners.forEach((unsubscribe) => unsubscribe());
    this.eventListeners.clear();
    this.analytics.abandonmentTime = Date.now();
  }

  /**
   * Get summary for analytics reporting
   */
  public getSummary() {
    const analytics = this.getAnalytics();
    const duration = (Date.now() - this.analytics.startTime) / 1000;

    return {
      duration,
      totalBytesTransferred: analytics.totalBytesTransferred,
      totalBufferingTime: analytics.totalBufferingTime,
      averageBitrate: analytics.averageBitrate,
      currentQuality: this.qualityManager.getCurrentQuality(),
      qualityChangeCount: analytics.qualityChanges.length,
      rebufferingCount: analytics.rebufferingCount,
      rebufferingRate: analytics.rebufferingCount / Math.max(1, duration / 60), // per minute
    };
  }
}

export default AdaptiveStreamingManager;
