/**
 * Bandwidth Estimator - Real-time network speed calculation
 * Estimates available bandwidth and predicts safe bitrates
 */

export interface BandwidthSample {
    timestamp: number;
    bytes: number;
    duration: number; // in milliseconds
}

export class BandwidthEstimator {
    private samples: BandwidthSample[] = [];
    private readonly maxSamples = 10;
    private readonly sampleWindow = 20000; // 20 seconds
    private bitrates = {
        low: 500, // kbps for 360p
        medium: 1500, // kbps for 480p
        high: 3500, // kbps for 720p
    };

    /**
     * Record a download sample
     */
    recordSample(bytes: number, duration: number): void {
        if (duration === 0) return;

        const now = Date.now();
        this.samples.push({ timestamp: now, bytes, duration });

        // Remove old samples outside window
        this.samples = this.samples.filter(
            (s) => now - s.timestamp < this.sampleWindow
        );

        // Keep only recent samples
        if (this.samples.length > this.maxSamples) {
            this.samples = this.samples.slice(-this.maxSamples);
        }
    }

    /**
     * Calculate current bandwidth in kbps
     */
    estimateBandwidth(): number {
        if (this.samples.length === 0) {
            return this.bitrates.high; // Optimistic default
        }

        // Calculate weighted average (recent samples weighted more)
        let totalBytes = 0;
        let totalDuration = 0;
        let weight = 1;

        for (let i = 0; i < this.samples.length; i++) {
            totalBytes += this.samples[i].bytes * weight;
            totalDuration += this.samples[i].duration * weight;
            weight *= 0.9; // Exponential weighting
        }

        if (totalDuration === 0) return this.bitrates.high;

        const bandwidthKbps = (totalBytes * 8) / (totalDuration / 1000);
        return Math.max(bandwidthKbps, 100); // Minimum 100 kbps
    }

    /**
     * Get recommended bitrate based on bandwidth
     */
    getRecommendedBitrate(): 'low' | 'medium' | 'high' {
        const bandwidth = this.estimateBandwidth();

        // Use 80% of available bandwidth for safety margin
        const safeBandwidth = bandwidth * 0.8;

        if (safeBandwidth >= this.bitrates.high) {
            return 'high';
        } else if (safeBandwidth >= this.bitrates.medium) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    /**
     * Check if bandwidth can sustain a given bitrate
     */
    canSustainBitrate(quality: 'low' | 'medium' | 'high'): boolean {
        const bandwidth = this.estimateBandwidth();
        return bandwidth * 0.8 >= this.bitrates[quality];
    }

    /**
     * Get current bandwidth in kbps with quality
     */
    getBandwidthInfo() {
        return {
            bandwidthKbps: Math.round(this.estimateBandwidth()),
            recommended: this.getRecommendedBitrate(),
            sampleCount: this.samples.length,
        };
    }

    /**
     * Reset estimator
     */
    reset(): void {
        this.samples = [];
    }
}
