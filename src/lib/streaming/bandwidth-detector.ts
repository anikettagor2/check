/**
 * Bandwidth Detection and Network Quality Monitoring
 * Monitors network conditions and estimates available bandwidth
 */

export interface NetworkQualityMetrics {
  bandwidth: number; // bits per second
  latency: number; // milliseconds
  packetLoss: number; // percentage (0-100)
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  connectionType: '4g' | '3g' | '2g' | 'wifi' | 'ethernet' | 'unknown';
}

export interface BandwidthHistory {
  timestamp: number;
  bandwidth: number;
  quality: string;
}

class BandwidthDetector {
  private bandwidth: number = 5000000; // Default 5 Mbps
  private latency: number = 50; // Default 50ms
  private packetLoss: number = 0;
  private connectionType: NetworkQualityMetrics['connectionType'] = 'unknown';
  private history: BandwidthHistory[] = [];
  private listeners: Set<(metrics: NetworkQualityMetrics) => void> = new Set();
  private samplingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.detectConnectionType();
    this.startMonitoring();
  }

  /**
   * Detect connection type using Network Information API
   */
  private detectConnectionType() {
    if (typeof window === 'undefined') return;

    const nav = navigator as any;
    
    if (nav.connection || nav.mozConnection || nav.webkitConnection) {
      const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
      this.updateConnectionType(connection.effectiveType);
      
      connection.addEventListener('change', () => {
        this.updateConnectionType(connection.effectiveType);
      });

      // Set initial bandwidth based on connection type
      this.updateBandwidthFromConnection(connection.effectiveType);
    }
  }

  private updateConnectionType(type: string) {
    const typeMap: Record<string, NetworkQualityMetrics['connectionType']> = {
      '4g': '4g',
      '3g': '3g',
      '2g': '2g',
      'slow-2g': '2g',
      'wifi': 'wifi',
    };
    this.connectionType = typeMap[type] || 'unknown';
  }

  private updateBandwidthFromConnection(type: string) {
    const bandwidthMap: Record<string, number> = {
      '4g': 15000000, // 15 Mbps
      '3g': 2000000, // 2 Mbps
      '2g': 500000, // 500 Kbps
      'slow-2g': 250000, // 250 Kbps
      'wifi': 25000000, // 25 Mbps
    };
    this.bandwidth = bandwidthMap[type] || 5000000;
  }

  /**
   * Start monitoring bandwidth using periodic measurements
   */
  private startMonitoring() {
    if (typeof window === 'undefined') return;

    // Monitor every 5 seconds
    this.samplingInterval = setInterval(() => {
      this.measureNetworkConditions();
    }, 5000);

    // Also measure on page unload
    window.addEventListener('beforeunload', () => this.stop());
  }

  /**
   * Measure network conditions via resource timing
   */
  private measureNetworkConditions() {
    if (typeof window === 'undefined' || !performance.getEntries) return;

    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    if (entries.length === 0) return;

    // Calculate average bandwidth from recent resource loads
    const recentEntries = entries.slice(-10); // Last 10 resources
    let totalSize = 0;
    let totalDuration = 0;

    recentEntries.forEach((entry) => {
      if (entry.transferSize > 0) {
        totalSize += entry.transferSize;
        totalDuration += entry.duration;
      }
    });

    if (totalDuration > 0) {
      // bandwidth = (size in bytes * 8 bits/byte) / (duration in ms / 1000)
      const measuredBandwidth = (totalSize * 8) / (totalDuration / 1000);
      
      // Smooth the measurement with existing bandwidth (30% new, 70% old)
      this.bandwidth = this.bandwidth * 0.7 + measuredBandwidth * 0.3;
    }

    this.notifyListeners();
  }

  /**
   * Simulate bandwidth change (for testing)
   */
  public simulateBandwidth(bps: number) {
    this.bandwidth = bps;
    this.notifyListeners();
  }

  /**
   * Determine quality based on bandwidth
   */
  private getQuality(): NetworkQualityMetrics['quality'] {
    // Quality thresholds (in bits per second)
    if (this.bandwidth < 1000000) return 'poor'; // < 1 Mbps
    if (this.bandwidth < 3000000) return 'fair'; // < 3 Mbps
    if (this.bandwidth < 8000000) return 'good'; // < 8 Mbps
    return 'excellent'; // >= 8 Mbps
  }

  /**
   * Get current metrics
   */
  public getMetrics(): NetworkQualityMetrics {
    return {
      bandwidth: Math.round(this.bandwidth),
      latency: this.latency,
      packetLoss: this.packetLoss,
      quality: this.getQuality(),
      connectionType: this.connectionType,
    };
  }

  /**
   * Get recommended bitrate (usually 70% of available bandwidth)
   */
  public getRecommendedBitrate(): number {
    return Math.round(this.bandwidth * 0.7);
  }

  /**
   * Check if bandwidth is suitable for bitrate
   */
  public canSupport(bitrate: number, safetyMargin: number = 1.5): boolean {
    return this.bandwidth > bitrate * safetyMargin;
  }

  /**
   * Subscribe to bandwidth changes
   */
  public onMetricsChange(callback: (metrics: NetworkQualityMetrics) => void): () => void {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    const metrics = this.getMetrics();
    this.listeners.forEach((callback) => callback(metrics));
    
    // Add to history
    this.history.push({
      timestamp: Date.now(),
      bandwidth: metrics.bandwidth,
      quality: metrics.quality,
    });

    // Keep only last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }

  /**
   * Get bandwidth history
   */
  public getHistory(): BandwidthHistory[] {
    return [...this.history];
  }

  /**
   * Get average bandwidth over a period
   */
  public getAverageBandwidth(durationMs: number = 60000): number {
    const cutoff = Date.now() - durationMs;
    const recentEntries = this.history.filter((h) => h.timestamp >= cutoff);
    
    if (recentEntries.length === 0) return this.bandwidth;
    
    const sum = recentEntries.reduce((acc, h) => acc + h.bandwidth, 0);
    return Math.round(sum / recentEntries.length);
  }

  /**
   * Stop monitoring
   */
  public stop() {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
    this.listeners.clear();
  }
}

// Singleton instance
let instance: BandwidthDetector | null = null;

export function getBandwidthDetector(): BandwidthDetector {
  if (typeof window === 'undefined') {
    // Return a dummy instance for SSR
    return {
      getMetrics: () => ({ bandwidth: 5000000, latency: 50, packetLoss: 0, quality: 'good', connectionType: 'unknown' }),
      getRecommendedBitrate: () => 3500000,
      canSupport: () => true,
      onMetricsChange: () => () => {},
      getHistory: () => [],
      getAverageBandwidth: () => 5000000,
      stop: () => {},
      simulateBandwidth: () => {},
    } as any;
  }

  if (!instance) {
    instance = new BandwidthDetector();
  }
  return instance;
}

export default BandwidthDetector;
