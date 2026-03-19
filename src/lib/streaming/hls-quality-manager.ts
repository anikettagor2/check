/**
 * HLS Quality Metadata and Management
 * Defines and manages video quality variants for HLS streaming
 */

export interface HLSQuality {
  level: number; // 0 = lowest, higher numbers = higher quality
  name: string; // e.g., "240p", "480p", "720p", "1080p", "4K"
  height: number; // vertical resolution
  width: number; // horizontal resolution
  bitrate: number; // bits per second
  codec: string; // video codec (e.g., "h264", "h265")
  frameRate: number; // frames per second
  bandwidth?: number; // optional bandwidth requirement (derived from bitrate)
}

export interface HLSPlaylist {
  url: string;
  originalResolution: string;
  qualities: HLSQuality[];
  duration: number;
  autoQuality: boolean;
  currentQuality: HLSQuality | null;
}

/**
 * Standard HLS quality definitions
 * Based on common streaming profiles
 */
export const STANDARD_QUALITIES: Record<string, HLSQuality> = {
  '240p': {
    level: 0,
    name: '240p (Low)',
    height: 240,
    width: 426,
    bitrate: 300000, // 300 Kbps
    codec: 'h264',
    frameRate: 24,
  },
  '360p': {
    level: 1,
    name: '360p (Fair)',
    height: 360,
    width: 640,
    bitrate: 700000, // 700 Kbps
    codec: 'h264',
    frameRate: 30,
  },
  '480p': {
    level: 2,
    name: '480p (Good)',
    height: 480,
    width: 854,
    bitrate: 1200000, // 1.2 Mbps
    codec: 'h264',
    frameRate: 30,
  },
  '720p': {
    level: 3,
    name: '720p (HD)',
    height: 720,
    width: 1280,
    bitrate: 2500000, // 2.5 Mbps
    codec: 'h264',
    frameRate: 30,
  },
  '1080p': {
    level: 4,
    name: '1080p (Full HD)',
    height: 1080,
    width: 1920,
    bitrate: 5000000, // 5 Mbps
    codec: 'h265',
    frameRate: 30,
  },
  '1440p': {
    level: 5,
    name: '1440p (2K)',
    height: 1440,
    width: 2560,
    bitrate: 8000000, // 8 Mbps
    codec: 'h265',
    frameRate: 30,
  },
  '2160p': {
    level: 6,
    name: '4K (2160p)',
    height: 2160,
    width: 3840,
    bitrate: 15000000, // 15 Mbps
    codec: 'h265',
    frameRate: 30,
  },
};

export class HLSQualityManager {
  private availableQualities: HLSQuality[] = [];
  private currentQuality: HLSQuality | null = null;
  private autoQualityEnabled: boolean = true;
  private qualityChangeListeners: Set<(quality: HLSQuality) => void> = new Set();

  constructor(sourceResolution?: string) {
    this.initializeQualities(sourceResolution);
  }

  /**
   * Initialize available qualities based on source resolution
   */
  private initializeQualities(sourceResolution?: string) {
    const resolutionMap: Record<string, HLSQuality[]> = {
      '4K': [
        STANDARD_QUALITIES['240p'],
        STANDARD_QUALITIES['360p'],
        STANDARD_QUALITIES['480p'],
        STANDARD_QUALITIES['720p'],
        STANDARD_QUALITIES['1080p'],
        STANDARD_QUALITIES['1440p'],
        STANDARD_QUALITIES['2160p'],
      ],
      '1080p': [
        STANDARD_QUALITIES['240p'],
        STANDARD_QUALITIES['360p'],
        STANDARD_QUALITIES['480p'],
        STANDARD_QUALITIES['720p'],
        STANDARD_QUALITIES['1080p'],
      ],
      '720p': [
        STANDARD_QUALITIES['240p'],
        STANDARD_QUALITIES['360p'],
        STANDARD_QUALITIES['480p'],
        STANDARD_QUALITIES['720p'],
      ],
      '480p': [
        STANDARD_QUALITIES['240p'],
        STANDARD_QUALITIES['360p'],
        STANDARD_QUALITIES['480p'],
      ],
      '360p': [
        STANDARD_QUALITIES['240p'],
        STANDARD_QUALITIES['360p'],
      ],
      '240p': [STANDARD_QUALITIES['240p']],
    };

    this.availableQualities = resolutionMap[sourceResolution || '1080p'] || resolutionMap['1080p'];
  }

  /**
   * Get available quality options
   */
  public getAvailableQualities(): HLSQuality[] {
    return [...this.availableQualities];
  }

  /**
   * Find quality by level
   */
  public getQualityByLevel(level: number): HLSQuality | null {
    return this.availableQualities.find((q) => q.level === level) || null;
  }

  /**
   * Find quality by height
   */
  public getQualityByHeight(height: number): HLSQuality | null {
    return this.availableQualities.find((q) => q.height === height) || null;
  }

  /**
   * Get quality for a given bandwidth
   */
  public getQualityForBandwidth(bandwidth: number): HLSQuality {
    // Find the highest quality that fits within bandwidth
    // Use a safety margin of 1.5x
    const safetyMargin = 1.5;
    const maxBitrate = bandwidth / safetyMargin;

    let selectedQuality = this.availableQualities[0]; // Default to lowest

    for (const quality of this.availableQualities) {
      if (quality.bitrate <= maxBitrate) {
        selectedQuality = quality;
      } else {
        break;
      }
    }

    return selectedQuality;
  }

  /**
   * Set current quality
   */
  public setQuality(quality: HLSQuality) {
    if (this.currentQuality?.level !== quality.level) {
      this.currentQuality = quality;
      this.notifyListeners();
    }
  }

  /**
   * Get current quality
   */
  public getCurrentQuality(): HLSQuality | null {
    return this.currentQuality;
  }

  /**
   * Enable/disable auto quality selection
   */
  public setAutoQuality(enabled: boolean) {
    this.autoQualityEnabled = enabled;
  }

  /**
   * Check if auto quality is enabled
   */
  public isAutoQualityEnabled(): boolean {
    return this.autoQualityEnabled;
  }

  /**
   * Get highest available quality
   */
  public getMaxQuality(): HLSQuality {
    return this.availableQualities[this.availableQualities.length - 1];
  }

  /**
   * Get lowest available quality
   */
  public getMinQuality(): HLSQuality {
    return this.availableQualities[0];
  }

  /**
   * Subscribe to quality changes
   */
  public onQualityChange(callback: (quality: HLSQuality) => void): () => void {
    this.qualityChangeListeners.add(callback);
    return () => this.qualityChangeListeners.delete(callback);
  }

  private notifyListeners() {
    if (this.currentQuality) {
      this.qualityChangeListeners.forEach((callback) => callback(this.currentQuality!));
    }
  }

  /**
   * Get quality recommendation
   */
  public getRecommendedQuality(bandwidth: number, viewportHeight: number): HLSQuality {
    // Consider both bandwidth and viewport size
    const bandwidthQuality = this.getQualityForBandwidth(bandwidth);

    // Don't recommend higher quality than viewport can display
    const viewportQuality =
      this.availableQualities.find((q) => q.height <= viewportHeight) || this.availableQualities[0];

    // Return the lower of the two
    return bandwidthQuality.level <= viewportQuality.level ? bandwidthQuality : viewportQuality;
  }

  /**
   * Export quality info as JSON
   */
  public toJSON() {
    return {
      availableQualities: this.availableQualities,
      currentQuality: this.currentQuality,
      autoQualityEnabled: this.autoQualityEnabled,
    };
  }
}

/**
 * HLS URL builder for constructing variant stream URLs
 */
export class HLSURLBuilder {
  private baseUrl: string;
  private quality: HLSQuality | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Build variant URL for a specific quality
   */
  public buildVariantUrl(quality: HLSQuality): string {
    // Replace placeholders in URL or append as query param
    const url = new URL(this.baseUrl);

    if (url.searchParams.has('quality')) {
      url.searchParams.set('quality', quality.height.toString());
    } else {
      // Assume URL structure: /path/to/master.m3u8
      const parts = this.baseUrl.split('/');
      const filename = parts[parts.length - 1];
      const basePath = this.baseUrl.replace(filename, '');
      return `${basePath}variant_${quality.height}p.m3u8`;
    }

    return url.toString();
  }

  /**
   * Build playlist URL with quality parameter
   */
  public buildPlaylistUrl(quality: HLSQuality): string {
    const params = new URLSearchParams();
    params.append('quality', quality.height.toString());
    params.append('bitrate', Math.round(quality.bitrate / 1000).toString());

    const separator = this.baseUrl.includes('?') ? '&' : '?';
    return `${this.baseUrl}${separator}${params.toString()}`;
  }

  /**
   * Check if URL supports quality variants
   */
  public supportsVariants(): boolean {
    return this.baseUrl.includes('master') || this.baseUrl.includes('manifest');
  }
}

export default HLSQualityManager;
