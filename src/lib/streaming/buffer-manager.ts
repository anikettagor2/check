/**
 * Buffer Manager - Maintains video buffer and triggers quality switches
 * Monitors buffer health and coordinates with adaptive bitrate controller
 */

export interface BufferState {
    bufferedSeconds: number;
    isBuffering: boolean;
    bufferHealth: 'critical' | 'low' | 'normal' | 'good';
    percentFilled: number;
}

export class BufferManager {
    private bufferedSeconds = 0;
    private readonly minBuffer = 3; // Minimum to start playback (3 seconds)
    private readonly targetBuffer = 8; // Target/normal buffer (8 seconds)
    private readonly maxBuffer = 20; // Maximum useful buffer (20 seconds)
    private isBuffering = false;
    private bufferDeathTimer: NodeJS.Timeout | null = null;

    // Callbacks
    private onBufferingStart: (() => void) | null = null;
    private onBufferingEnd: (() => void) | null = null;
    private onQualityDowngrade: ((quality: 'low' | 'medium' | 'high') => void) | null = null;

    constructor() {
        this.reset();
    }

    /**
     * Add data to buffer (simulates chunk received)
     */
    addToBuffer(seconds: number): void {
        this.bufferedSeconds += seconds;
        this.bufferedSeconds = Math.min(this.bufferedSeconds, this.maxBuffer);

        // Clear buffering state if we have enough
        if (this.isBuffering && this.bufferedSeconds >= this.minBuffer) {
            this.setBuffering(false);
        }
    }

    /**
     * Consume data from buffer (simulates playback)
     */
    consumeFromBuffer(seconds: number): void {
        this.bufferedSeconds -= seconds;
        this.bufferedSeconds = Math.max(this.bufferedSeconds, 0);

        // Trigger buffering if buffer gets critical
        if (this.bufferedSeconds < this.minBuffer && !this.isBuffering) {
            this.setBuffering(true);
        }
    }

    /**
     * Get current buffer state
     */
    getBufferState(): BufferState {
        let bufferHealth: BufferState['bufferHealth'];

        if (this.bufferedSeconds < this.minBuffer) {
            bufferHealth = 'critical';
        } else if (this.bufferedSeconds < this.targetBuffer * 0.5) {
            bufferHealth = 'low';
        } else if (this.bufferedSeconds >= this.targetBuffer) {
            bufferHealth = 'good';
        } else {
            bufferHealth = 'normal';
        }

        return {
            bufferedSeconds: this.bufferedSeconds,
            isBuffering: this.isBuffering,
            bufferHealth,
            percentFilled: (this.bufferedSeconds / this.maxBuffer) * 100,
        };
    }

    /**
     * Determine recommended quality based on buffer health
     */
    getQualityRecommendation(): 'low' | 'medium' | 'high' {
        const state = this.getBufferState();

        // Critical: drop to lowest quality
        if (state.bufferHealth === 'critical') {
            return 'low';
        }

        // Low: prefer lower quality
        if (state.bufferHealth === 'low') {
            return 'medium';
        }

        // Good: can handle high quality
        if (state.bufferHealth === 'good') {
            return 'high';
        }

        // Normal: medium quality
        return 'medium';
    }

    /**
     * Should we preload next chunks?
     */
    shouldPrefetch(): boolean {
        // Prefetch aggressively if buffer is stable or good
        const state = this.getBufferState();
        return (
            state.bufferHealth === 'good' ||
            state.bufferHealth === 'normal'
        );
    }

    /**
     * Set buffering state and trigger callbacks
     */
    private setBuffering(buffering: boolean): void {
        if (this.isBuffering === buffering) return;

        this.isBuffering = buffering;

        if (buffering) {
            console.log('[BufferManager] Buffering started');
            this.onBufferingStart?.();
        } else {
            console.log('[BufferManager] Buffering ended');
            this.onBufferingEnd?.();
        }
    }

    /**
     * Register callbacks
     */
    onBufferingStateChange(
        onStart: (() => void) | null,
        onEnd: (() => void) | null
    ): void {
        this.onBufferingStart = onStart;
        this.onBufferingEnd = onEnd;
    }

    onQualitySuggestion(callback: (quality: 'low' | 'medium' | 'high') => void): void {
        this.onQualityDowngrade = callback;
    }

    /**
     * Trigger quality downgrade based on buffer state
     */
    evaluateQualityDowngrade(): void {
        const state = this.getBufferState();

        // If buffer is critical, suggest downgrade
        if (state.bufferHealth === 'critical') {
            const recommendation = this.getQualityRecommendation();
            this.onQualityDowngrade?.(recommendation);
        }
    }

    /**
     * Get metrics for monitoring
     */
    getMetrics() {
        const state = this.getBufferState();
        return {
            ...state,
            minBuffer: this.minBuffer,
            targetBuffer: this.targetBuffer,
            maxBuffer: this.maxBuffer,
            qualityRecommendation: this.getQualityRecommendation(),
            shouldPrefetch: this.shouldPrefetch(),
        };
    }

    /**
     * Reset buffer
     */
    reset(): void {
        this.bufferedSeconds = 0;
        this.isBuffering = false;
    }
}
