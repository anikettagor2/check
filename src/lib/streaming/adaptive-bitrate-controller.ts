/**
 * Adaptive Bitrate Controller (ABR)
 * Manages quality switches based on bandwidth and buffer conditions
 * Prevents rebuffering by switching quality smoothly
 */

export interface QualityLevel {
    name: 'low' | 'medium' | 'high';
    bitrateMbps: number;
    resolution: string;
    label: string;
}

export const QUALITY_LEVELS: Record<string, QualityLevel> = {
    low: {
        name: 'low',
        bitrateMbps: 0.5,
        resolution: '360p',
        label: '360p (Low)',
    },
    medium: {
        name: 'medium',
        bitrateMbps: 1.5,
        resolution: '480p',
        label: '480p (Medium)',
    },
    high: {
        name: 'high',
        bitrateMbps: 3.5,
        resolution: '720p',
        label: '720p (High)',
    },
};

export class AdaptiveBitrateController {
    private currentQuality: 'low' | 'medium' | 'high' = 'medium';
    private requestedQuality: 'low' | 'medium' | 'high' = 'medium';
    private qualitySwitchPending = false;
    private lastSwitchTime = 0;
    private readonly minSwitchInterval = 3000; // Min 3 seconds between switches
    private readonly upgradeThreshold = 5000; // Upgrade after 5 seconds of stability

    // Metrics
    private stabilityCounter = 0;
    private downgradeCounter = 0;

    // Callbacks
    private onQualityChange: ((from: string, to: string) => void) | null = null;
    private onQualitySwitching: ((to: string) => void) | null = null;

    constructor() {
        this.trackMetrics();
    }

    /**
     * Get current quality level info
     */
    getCurrentQuality(): QualityLevel {
        return QUALITY_LEVELS[this.currentQuality];
    }

    /**
     * Request quality change based on network conditions
     * This is non-blocking and respects minimum switch interval
     */
    requestQualityChange(quality: 'low' | 'medium' | 'high'): boolean {
        if (quality === this.currentQuality && !this.qualitySwitchPending) {
            return false; // No change needed
        }

        const now = Date.now();
        const timeSinceLastSwitch = now - this.lastSwitchTime;

        // Allow immediate downgrade (urgent), but restrict upgrades
        const isDowngrade = this.getQualityValue(quality) < this.getQualityValue(this.currentQuality);

        if (timeSinceLastSwitch < this.minSwitchInterval && !isDowngrade) {
            console.log(
                `[ABR] Quality switch too frequent. Requested ${quality}, keeping ${this.currentQuality}`
            );
            this.requestedQuality = quality; // Queue for later
            return false;
        }

        return this.applyQualityChange(quality);
    }

    /**
     * Apply quality change and notify listeners
     */
    private applyQualityChange(quality: 'low' | 'medium' | 'high'): boolean {
        if (quality === this.currentQuality) return false;

        const oldQuality = this.currentQuality;
        this.quality = quality;
        this.lastSwitchTime = Date.now();
        this.qualitySwitchPending = false;
        this.stabilityCounter = 0;

        console.log(`[ABR] Quality switched: ${oldQuality} → ${quality}`);
        this.onQualityChange?.(oldQuality, quality);

        return true;
    }

    private set quality(value: 'low' | 'medium' | 'high') {
        this.currentQuality = value;
    }

    /**
     * Get numeric quality value for comparison
     */
    private getQualityValue(quality: 'low' | 'medium' | 'high'): number {
        return { low: 1, medium: 2, high: 3 }[quality];
    }

    /**
     * Intelligently suggest quality based on bandwidth and buffer
     * Prioritizes stability over quality
     */
    suggestQuality(
        bandwidthKbps: number,
        bufferHealth: 'critical' | 'low' | 'normal' | 'good'
    ): 'low' | 'medium' | 'high' {
        const safeBandwidth = bandwidthKbps * 0.8;

        // Critical buffer: force low quality
        if (bufferHealth === 'critical') {
            this.downgradeCounter++;
            return 'low';
        }

        // Low buffer: conservative quality
        if (bufferHealth === 'low') {
            this.downgradeCounter++;
            return safeBandwidth >= 1200 ? 'medium' : 'low';
        }

        // Normal/Good buffer: adaptive quality
        if (safeBandwidth >= 3000) {
            this.stabilityCounter++;
            // Only upgrade after sustained stability
            if (this.stabilityCounter > this.upgradeThreshold / 100) {
                return 'high';
            }
            return this.currentQuality;
        } else if (safeBandwidth >= 1200) {
            this.stabilityCounter++;
            return 'medium';
        } else {
            this.downgradeCounter++;
            return 'low';
        }
    }

    /**
     * Try to upgrade quality if conditions are favorable
     */
    tryUpgradeQuality(
        bandwidthKbps: number,
        bufferHealth: 'critical' | 'low' | 'normal' | 'good'
    ): boolean {
        if (this.currentQuality === 'high') return false; // Already at highest

        const now = Date.now();
        if (now - this.lastSwitchTime < this.upgradeThreshold) {
            return false; // Too soon to upgrade
        }

        if (bufferHealth !== 'good') {
            return false; // Not safe to upgrade
        }

        const safeBandwidth = bandwidthKbps * 0.8;
        const nextQuality = this.getNextQuality();

        if (safeBandwidth >= QUALITY_LEVELS[nextQuality].bitrateMbps * 1000) {
            return this.requestQualityChange(nextQuality);
        }

        return false;
    }

    /**
     * Get the next higher quality
     */
    private getNextQuality(): 'low' | 'medium' | 'high' {
        if (this.currentQuality === 'low') return 'medium';
        if (this.currentQuality === 'medium') return 'high';
        return 'high';
    }

    /**
     * Register quality change callback
     */
    onQualityChangeListener(
        callback: (from: string, to: string) => void
    ): void {
        this.onQualityChange = callback;
    }

    /**
     * Register switching callback (for UI feedback)
     */
    onQualitySwitchingListener(
        callback: (to: string) => void
    ): void {
        this.onQualitySwitching = callback;
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            currentQuality: this.currentQuality,
            currentBitrate: `${QUALITY_LEVELS[this.currentQuality].bitrateMbps} Mbps`,
            resolution: QUALITY_LEVELS[this.currentQuality].resolution,
            stabilityCounter: this.stabilityCounter,
            downgradeCounter: this.downgradeCounter,
            pendingSwitch: this.qualitySwitchPending,
        };
    }

    /**
     * Track and reset metrics periodically
     */
    private trackMetrics(): void {
        setInterval(() => {
            // Reset counters every 30 seconds for fresh metrics
            if (this.stabilityCounter > 100) {
                this.stabilityCounter = 50; // Keep some memory
            }
        }, 30000);
    }

    /**
     * Reset controller
     */
    reset(): void {
        this.currentQuality = 'medium';
        this.requestedQuality = 'medium';
        this.qualitySwitchPending = false;
        this.lastSwitchTime = 0;
        this.stabilityCounter = 0;
        this.downgradeCounter = 0;
    }
}
